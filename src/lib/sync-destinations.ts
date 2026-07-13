import { S3Client, PutObjectCommand, HeadBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import dns from 'node:dns/promises';
import net from 'node:net';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { userStorageConnections } from '../db/schema';
import { decryptSyncSecret } from './sync-secrets';
import { encryptSyncSecret } from './sync-secrets';

const runtimeEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const googleClientId = runtimeEnv?.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = runtimeEnv?.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

export interface SyncDestination {
  testConnection(): Promise<void>;
  putObject(input: { destinationKey: string; body: Buffer; contentType: string; sha256: string; signal?: AbortSignal; overwrite?: boolean }): Promise<{ remoteId?: string; etag?: string }>;
  exists(destinationKey: string): Promise<boolean>;
}

function joinPath(...parts: (string | null | undefined)[]) { return parts.filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\//, ''); }

class S3SyncDestination implements SyncDestination {
  constructor(private readonly client: S3Client, private readonly bucket: string, private readonly root?: string) {}
  async testConnection() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const details = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
      const status = details.$metadata?.httpStatusCode;
      const reason = status === 403
        ? 'access was denied; verify the access key, secret key, bucket policy, and bucket name'
        : status === 404
          ? 'the bucket was not found; verify the bucket name and endpoint'
          : status === 400
            ? 'the request was rejected; verify the endpoint, signing region, and path-style setting'
            : details.message && details.name !== 'UnknownError' ? details.message : 'verify the endpoint, region, bucket, and credentials';
      throw new Error(`S3 connection failed${status ? ` (HTTP ${status})` : ''}: ${reason}`);
    }
  }
  async exists(destinationKey: string) { try { await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: joinPath(this.root, destinationKey) })); return true; } catch { return false; } }
  async putObject(input: { destinationKey: string; body: Buffer; contentType: string; sha256: string; signal?: AbortSignal; overwrite?: boolean }) {
    const key = joinPath(this.root, input.destinationKey);
    if (!input.overwrite && await this.exists(input.destinationKey)) return { remoteId: key };
    const result = await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: input.body, ContentType: input.contentType, Metadata: { sha256: input.sha256 } }), { abortSignal: input.signal });
    return { remoteId: key, etag: result.ETag };
  }
}

function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
  }
  return address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:');
}

async function validateWebdavUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('WebDAV endpoints must use HTTPS');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('WebDAV endpoint resolves to a private or local address');
  return url;
}

class WebdavSyncDestination implements SyncDestination {
  constructor(private readonly url: URL, private readonly username: string, private readonly password: string, private readonly root?: string) {}
  private headers(extra?: Record<string, string>) { return { Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, ...extra }; }
  private target(key: string) { return new URL(`/${joinPath(this.url.pathname, this.root, key)}${key ? '' : '/'}`, this.url.origin); }
  private async ensureCollections(key: string) {
    // The configured URL is already the WebDAV collection root. Only create
    // folders beneath it; never try to MKCOL the server's endpoint path
    // (for example /remote.php/dav/files/user), which commonly returns 404.
    const parts = joinPath(this.root, key).split('/').filter(Boolean);
    let current = '';
    for (const part of parts.slice(0, -1)) {
      current += `/${part}`;
      const response = await fetch(new URL(`${joinPath(this.url.pathname, current)}/`, this.url.origin), { method: 'MKCOL', headers: this.headers(), redirect: 'error' });
      if (!response.ok && response.status !== 405) throw new Error(`WebDAV directory creation failed (${response.status})`);
    }
  }
  async testConnection() { const response = await fetch(this.url, { method: 'PROPFIND', headers: this.headers({ Depth: '0' }), redirect: 'error' }); if (!response.ok && response.status !== 207) throw new Error(`WebDAV connection failed (${response.status})`); }
  async exists(key: string) { const response = await fetch(this.target(key), { method: 'HEAD', headers: this.headers(), redirect: 'error' }); return response.ok; }
  async putObject(input: { destinationKey: string; body: Buffer; contentType: string; sha256: string; signal?: AbortSignal; overwrite?: boolean }) {
    if (!input.overwrite && await this.exists(input.destinationKey)) return { remoteId: this.target(input.destinationKey).toString() };
    await this.ensureCollections(input.destinationKey);
    const target = this.target(input.destinationKey);
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(target, { method: 'PUT', headers: this.headers({ 'Content-Type': input.contentType, 'Content-Length': String(input.body.length), 'X-PDAM-SHA256': input.sha256, ...(input.overwrite ? {} : { 'If-None-Match': '*' }) }), body: new Uint8Array(input.body), redirect: 'error', signal: input.signal });
      if (response.ok) return { remoteId: target.toString(), etag: response.headers.get('etag') ?? undefined };
      lastStatus = response.status;
      if (![423, 429, 500, 502, 503, 504].includes(response.status)) break;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
    if (lastStatus === 423) throw new Error('WebDAV upload failed (423 Locked): the destination file or folder is locked; retry after the other WebDAV client finishes');
    throw new Error(`WebDAV upload failed (${lastStatus})`);
  }
}

type GoogleCredentials = { accessToken: string; refreshToken: string; accessTokenExpiresAt?: string | null };

class GoogleDriveSyncDestination implements SyncDestination {
  private rootFolderId: string | null = null;
  constructor(private readonly connectionId: string, private readonly rootPath: string | null, private credentials: GoogleCredentials) {}

  private async saveCredentials() {
    await db.update(userStorageConnections).set({
      credentialsEncrypted: encryptSyncSecret(JSON.stringify(this.credentials)),
      updatedAt: new Date(),
    }).where(eq(userStorageConnections.id, this.connectionId));
  }

  private async refreshToken() {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: googleClientId ?? '',
        client_secret: googleClientSecret ?? '',
        refresh_token: this.credentials.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!response.ok || !data.access_token) throw new Error(`Google Drive authorization failed: ${data.error_description ?? 'reconnect Google Drive'}`);
    this.credentials.accessToken = data.access_token;
    this.credentials.accessTokenExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
    await this.saveCredentials();
  }

  private async authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const expiresAt = this.credentials.accessTokenExpiresAt ? new Date(this.credentials.accessTokenExpiresAt).getTime() : 0;
    if (!this.credentials.accessToken || expiresAt <= Date.now() + 60_000) await this.refreshToken();
    const request = () => fetch(input, { ...init, headers: { ...init.headers, Authorization: `Bearer ${this.credentials.accessToken}` }, redirect: 'error' });
    let response = await request();
    if (response.status === 401) { await this.refreshToken(); response = await request(); }
    return response;
  }

  private async findOrCreateFolder(name: string, parentId?: string) {
    const escapedName = name.replace(/'/g, "\\'");
    const query = [`name = '${escapedName}'`, "mimeType = 'application/vnd.google-apps.folder'", 'trashed = false', parentId ? `'${parentId}' in parents` : ''].filter(Boolean).join(' and ');
    const list = await this.authorizedFetch(`https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q: query, fields: 'files(id)', pageSize: '1' })}`);
    const result = await list.json().catch(() => ({})) as { files?: { id: string }[] };
    if (list.ok && result.files?.[0]) return result.files[0].id;
    const create = await this.authorizedFetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }) });
    const created = await create.json().catch(() => ({})) as { id?: string; error?: { message?: string } };
    if (!create.ok || !created.id) throw new Error(`Google Drive folder creation failed: ${created.error?.message ?? create.status}`);
    return created.id;
  }

  private async folderFor(key: string) {
    if (!this.rootFolderId) this.rootFolderId = await this.findOrCreateFolder(this.rootPath || 'TailCache Backups');
    let folderId = this.rootFolderId;
    for (const part of key.split('/').slice(0, -1).filter(Boolean)) folderId = await this.findOrCreateFolder(part, folderId);
    return folderId;
  }

  async testConnection() {
    const response = await this.authorizedFetch('https://www.googleapis.com/drive/v3/about?fields=user');
    if (!response.ok) throw new Error(`Google Drive connection failed (${response.status})`);
    await this.folderFor('connection-check');
  }

  private async findFile(destinationKey: string) {
    const folderId = await this.folderFor(destinationKey);
    const name = destinationKey.split('/').pop()?.replace(/'/g, "\\'") ?? '';
    const query = `name = '${name}' and '${folderId}' in parents and trashed = false`;
    const response = await this.authorizedFetch(`https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q: query, fields: 'files(id)', pageSize: '1' })}`);
    const data = await response.json().catch(() => ({})) as { files?: { id: string }[] };
    return response.ok ? data.files?.[0]?.id ?? null : null;
  }

  async exists(destinationKey: string) {
    return Boolean(await this.findFile(destinationKey));
  }

  async putObject(input: { destinationKey: string; body: Buffer; contentType: string; sha256: string; signal?: AbortSignal; overwrite?: boolean }) {
    const existingId = await this.findFile(input.destinationKey);
    if (!input.overwrite && existingId) return { remoteId: existingId };
    const folderId = await this.folderFor(input.destinationKey);
    const name = input.destinationKey.split('/').pop() ?? 'file';
    const boundary = `pdam-${crypto.randomUUID()}`;
    const prefix = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId], appProperties: { sha256: input.sha256 } })}\r\n--${boundary}\r\nContent-Type: ${input.contentType}\r\n\r\n`);
    const suffix = Buffer.from(`\r\n--${boundary}--`);
    const response = await this.authorizedFetch(`https://www.googleapis.com/upload/drive/v3/files${existingId ? `/${existingId}` : ''}?uploadType=multipart&fields=id,md5Checksum`, {
      method: existingId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: Buffer.concat([prefix, input.body, suffix]), signal: input.signal,
    });
    const data = await response.json().catch(() => ({})) as { id?: string; md5Checksum?: string; error?: { message?: string } };
    if (!response.ok || !data.id) throw new Error(`Google Drive upload failed: ${data.error?.message ?? response.status}`);
    return { remoteId: data.id, etag: data.md5Checksum };
  }
}

export async function createSyncDestination(connection: { id: string; providerType: string; rootPath: string | null; credentialsEncrypted: string | null }): Promise<SyncDestination> {
  if (!connection.credentialsEncrypted) throw new Error('Destination credentials are missing');
  const credentials = JSON.parse(decryptSyncSecret(connection.credentialsEncrypted)) as Record<string, string | boolean>;
  if (connection.providerType === 's3') {
    const client = new S3Client({ endpoint: String(credentials.endpoint), region: String(credentials.region || 'auto'), forcePathStyle: credentials.forcePathStyle !== false, credentials: { accessKeyId: String(credentials.accessKeyId), secretAccessKey: String(credentials.secretAccessKey) } });
    return new S3SyncDestination(client, String(credentials.bucket), connection.rootPath ?? undefined);
  }
  if (connection.providerType === 'webdav') {
    const url = await validateWebdavUrl(String(credentials.endpoint));
    return new WebdavSyncDestination(url, String(credentials.username), String(credentials.password), connection.rootPath ?? undefined);
  }
  if (connection.providerType === 'google-drive') {
    return new GoogleDriveSyncDestination(connection.id, connection.rootPath, credentials as unknown as GoogleCredentials);
  }
  throw new Error(`Unsupported sync destination: ${connection.providerType}`);
}

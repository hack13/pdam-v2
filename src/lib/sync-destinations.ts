import { S3Client, PutObjectCommand, HeadBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import dns from 'node:dns/promises';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { userStorageConnections } from '../db/schema';
import { decryptSyncSecret, encryptSyncSecret } from './sync-secrets';

const runtimeEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const googleClientId = runtimeEnv?.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = runtimeEnv?.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
const NEXTCLOUD_CHUNK_BYTES = 64 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

export type SyncFailureCode =
  | 'DESTINATION_AUTH' | 'DESTINATION_FORBIDDEN' | 'DESTINATION_QUOTA' | 'DESTINATION_LOCKED'
  | 'DESTINATION_RATE_LIMITED' | 'DESTINATION_NETWORK' | 'DESTINATION_PROTOCOL' | 'REMOTE_CONFLICT'
  | 'SOURCE_UNAVAILABLE';

export class SyncDestinationError extends Error {
  constructor(
    message: string,
    readonly code: SyncFailureCode,
    readonly httpStatus?: number,
    readonly retryable = false,
  ) { super(message); }
}

export interface SyncObjectSource {
  byteSize: number;
  sha256: string;
  openRange(start: number, end: number): Promise<AsyncIterable<Uint8Array>>;
}

export interface SyncDestination {
  testConnection(): Promise<void>;
  putObject(input: {
    destinationKey: string;
    body?: Buffer;
    source?: SyncObjectSource;
    contentType: string;
    sha256: string;
    signal?: AbortSignal;
    overwrite?: boolean;
    resume?: {
      transferSessionId?: string | null;
      onProgress(update: { transferSessionId: string | null; bytesTransferred: number; httpStatus?: number }): Promise<void>;
    };
  }): Promise<{ remoteId?: string; etag?: string; transferSessionId?: string | null }>;
  exists(destinationKey: string): Promise<boolean>;
}

function joinPath(...parts: (string | null | undefined)[]) { return parts.filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\//, ''); }
function encodedPath(path: string) { return path.split('/').filter(Boolean).map((part) => encodeURIComponent(part)).join('/'); }

function classifyStatus(status: number): SyncDestinationError {
  if (status === 401) return new SyncDestinationError('Destination authentication failed; use a valid app password', 'DESTINATION_AUTH', status);
  if (status === 403) return new SyncDestinationError('Destination access was denied', 'DESTINATION_FORBIDDEN', status);
  if (status === 413 || status === 507) return new SyncDestinationError('Destination has insufficient upload or storage capacity', 'DESTINATION_QUOTA', status);
  if (status === 423) return new SyncDestinationError('Destination file or folder is locked', 'DESTINATION_LOCKED', status, true);
  if (status === 429) return new SyncDestinationError('Destination rate limited this sync', 'DESTINATION_RATE_LIMITED', status, true);
  return new SyncDestinationError(`Destination request failed (${status})`, 'DESTINATION_PROTOCOL', status, [500, 502, 503, 504].includes(status));
}

function networkError(error: unknown) {
  if (error instanceof SyncDestinationError) return error;
  if (error instanceof Error && error.name === 'AbortError') return new SyncDestinationError('Destination request timed out or was cancelled', 'DESTINATION_NETWORK', undefined, true);
  return new SyncDestinationError('Destination network request failed', 'DESTINATION_NETWORK', undefined, true);
}

async function waitForRetry(response: Response | undefined, attempt: number, signal?: AbortSignal) {
  const seconds = response?.headers.get('retry-after');
  const retryAfter = seconds && /^\d+$/.test(seconds) ? Number(seconds) * 1000 : 0;
  const delay = Math.min(30_000, retryAfter || 1_000 * 2 ** attempt);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delay);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

async function withTimeout(init: RequestInit, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  return { init: { ...init, signal: combined }, done: () => clearTimeout(timer) };
}

class S3SyncDestination implements SyncDestination {
  constructor(private readonly client: S3Client, private readonly bucket: string, private readonly root?: string) {}
  async testConnection() {
    try { await this.client.send(new HeadBucketCommand({ Bucket: this.bucket })); }
    catch (error) {
      const details = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
      const status = details.$metadata?.httpStatusCode;
      const reason = status === 403 ? 'access was denied; verify credentials and bucket policy' : status === 404 ? 'the bucket was not found' : details.message ?? 'verify endpoint and credentials';
      throw new Error(`S3 connection failed${status ? ` (HTTP ${status})` : ''}: ${reason}`);
    }
  }
  async exists(destinationKey: string) { try { await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: joinPath(this.root, destinationKey) })); return true; } catch { return false; } }
  async putObject(input: Parameters<SyncDestination['putObject']>[0]) {
    const key = joinPath(this.root, input.destinationKey);
    if (!input.overwrite && await this.exists(input.destinationKey)) return { remoteId: key };
    const body = input.body ?? await input.source?.openRange(0, input.source.byteSize - 1);
    if (!body) throw new SyncDestinationError('Source file is unavailable', 'SOURCE_UNAVAILABLE');
    const result = await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body as never, ContentType: input.contentType, Metadata: { sha256: input.sha256 } }), { abortSignal: input.signal });
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

export async function validateWebdavUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('WebDAV endpoints must use HTTPS');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('WebDAV endpoint resolves to a private or local address');
  return url;
}

async function readSource(source?: SyncObjectSource) {
  if (!source) throw new SyncDestinationError('Source file is unavailable', 'SOURCE_UNAVAILABLE');
  const chunks: Uint8Array[] = [];
  for await (const chunk of await source.openRange(0, source.byteSize - 1)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function prop(xml: string, name: string) {
  const match = xml.match(new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([^<]*)<\\/(?:[\\w-]+:)?${name}>`, 'i'));
  return match?.[1]?.trim() ?? null;
}

class WebdavSyncDestination implements SyncDestination {
  constructor(protected readonly url: URL, protected readonly username: string, protected readonly password: string, protected readonly root?: string) {}
  protected headers(extra?: Record<string, string>) { return { Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, ...extra }; }
  protected target(key: string) { return new URL(`/${joinPath(this.url.pathname, this.root, key)}${key ? '' : '/'}`, this.url.origin); }
  protected async request(target: URL, init: RequestInit, signal?: AbortSignal) {
    const timeout = await withTimeout({ ...init, redirect: 'error' }, signal);
    try { return await fetch(target, timeout.init); } catch (error) { throw networkError(error); } finally { timeout.done(); }
  }
  protected async ensureCollections(key: string) {
    const parts = joinPath(this.root, key).split('/').filter(Boolean);
    let current = '';
    for (const part of parts.slice(0, -1)) {
      current += `/${part}`;
      const response = await this.request(new URL(`${joinPath(this.url.pathname, current)}/`, this.url.origin), { method: 'MKCOL', headers: this.headers() });
      if (!response.ok && response.status !== 405) throw classifyStatus(response.status);
    }
  }
  async testConnection() {
    const response = await this.request(this.url, { method: 'PROPFIND', headers: this.headers({ Depth: '0' }) });
    if (!response.ok && response.status !== 207) throw classifyStatus(response.status);
  }
  async exists(key: string) { const response = await this.request(this.target(key), { method: 'HEAD', headers: this.headers() }); return response.ok; }
  async putObject(input: Parameters<SyncDestination['putObject']>[0]) {
    if (!input.overwrite && await this.exists(input.destinationKey)) return { remoteId: this.target(input.destinationKey).toString() };
    await this.ensureCollections(input.destinationKey);
    const target = this.target(input.destinationKey);
    for (let attempt = 0; attempt < 3; attempt++) {
      const body = input.body
        ? new Uint8Array(input.body)
        : input.source ? await input.source.openRange(0, input.source.byteSize - 1) : null;
      const length = input.body?.length ?? input.source?.byteSize;
      if (!body || length == null) throw new SyncDestinationError('Source file is unavailable', 'SOURCE_UNAVAILABLE');
      const response = await this.request(target, {
        method: 'PUT',
        headers: this.headers({ 'Content-Type': input.contentType, 'Content-Length': String(length), ...(input.overwrite ? {} : { 'If-None-Match': '*' }) }),
        body: body as unknown as BodyInit,
        ...(input.source && { duplex: 'half' }),
      } as RequestInit, input.signal);
      if (response.ok) return { remoteId: target.toString(), etag: response.headers.get('etag') ?? undefined };
      const error = classifyStatus(response.status);
      if (!error.retryable || attempt === 2) throw error;
      await waitForRetry(response, attempt, input.signal);
    }
    throw new SyncDestinationError('WebDAV upload failed', 'DESTINATION_PROTOCOL');
  }
}

type NextcloudEndpoint = { filesBase: URL; uploadsBase: URL; user: string };

export function parseNextcloudEndpoint(url: URL): NextcloudEndpoint {
  const match = url.pathname.match(/^(.*\/remote\.php\/dav)\/files\/([^/]+)\/?$/);
  if (!match) throw new Error('Nextcloud endpoint must be the collection URL ending in /remote.php/dav/files/<user>/');
  const prefix = match[1];
  const user = decodeURIComponent(match[2]);
  return {
    user,
    filesBase: new URL(`${prefix}/files/${encodeURIComponent(user)}/`, url.origin),
    uploadsBase: new URL(`${prefix}/uploads/${encodeURIComponent(user)}/`, url.origin),
  };
}

export function nextcloudChunkName(start: number, end: number) {
  return `${String(start).padStart(15, '0')}-${String(end).padStart(15, '0')}`;
}

class NextcloudSyncDestination extends WebdavSyncDestination {
  private readonly endpoint: NextcloudEndpoint;
  constructor(url: URL, username: string, password: string, root?: string) { super(url, username, password, root); this.endpoint = parseNextcloudEndpoint(url); }
  protected override target(key: string) { return new URL(encodedPath(joinPath(this.root, key)), this.endpoint.filesBase); }
  private uploadTarget(sessionId: string, chunk?: string) { return new URL(`${encodedPath(sessionId)}${chunk ? `/${chunk}` : '/'}`, this.endpoint.uploadsBase); }
  private async remoteProperties(target: URL) {
    const response = await this.request(target, { method: 'PROPFIND', headers: this.headers({ Depth: '0', 'Content-Type': 'application/xml' }), body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:getcontentlength/><d:getetag/><oc:checksum/></d:prop></d:propfind>' });
    if (response.status === 404) return null;
    if (!response.ok && response.status !== 207) throw classifyStatus(response.status);
    const xml = await response.text();
    return { byteSize: Number(prop(xml, 'getcontentlength') ?? NaN), etag: prop(xml, 'getetag'), checksum: prop(xml, 'checksum') };
  }
  private async existingChunks(sessionId: string) {
    const response = await this.request(this.uploadTarget(sessionId), { method: 'PROPFIND', headers: this.headers({ Depth: '1' }) });
    if (response.status === 404) return new Map<string, number>();
    if (!response.ok && response.status !== 207) throw classifyStatus(response.status);
    const xml = await response.text();
    const chunks = new Map<string, number>();
    const responses = [...xml.matchAll(/<(?:[\w-]+:)?response(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi)];
    for (const entry of responses) {
      const href = prop(entry[1], 'href');
      const size = Number(prop(entry[1], 'getcontentlength') ?? NaN);
      const name = href?.split('/').filter(Boolean).at(-1);
      if (name && Number.isFinite(size)) chunks.set(decodeURIComponent(name), size);
    }
    return chunks;
  }
  private async ensureUploadSession(sessionId: string) {
    const response = await this.request(this.uploadTarget(sessionId), { method: 'MKCOL', headers: this.headers() });
    if (!response.ok && response.status !== 405) throw classifyStatus(response.status);
  }
  private async uploadChunk(input: Parameters<SyncDestination['putObject']>[0], sessionId: string, start: number, end: number, chunkName: string) {
    if (!input.source) throw new SyncDestinationError('Nextcloud chunking requires a streaming source', 'SOURCE_UNAVAILABLE');
    for (let attempt = 0; attempt < 5; attempt++) {
      const length = end - start + 1;
      try {
        const stream = await input.source.openRange(start, end);
        const response = await this.request(this.uploadTarget(sessionId, chunkName), {
          method: 'PUT', headers: this.headers({ 'Content-Type': input.contentType, 'Content-Length': String(length), 'OC-Total-Length': String(input.source.byteSize) }),
          body: stream as unknown as BodyInit,
          // Node fetch needs this marker for async-iterable request bodies.
          duplex: 'half',
        } as RequestInit, input.signal);
        if (response.ok) return response.status;
        const error = classifyStatus(response.status);
        if (!error.retryable || attempt === 4) throw error;
        await waitForRetry(response, attempt, input.signal);
      } catch (error) {
        const classified = networkError(error);
        if (!classified.retryable || attempt === 4) throw classified;
        await waitForRetry(undefined, attempt, input.signal);
      }
    }
    throw new SyncDestinationError('Nextcloud chunk upload failed', 'DESTINATION_PROTOCOL');
  }
  override async putObject(input: Parameters<SyncDestination['putObject']>[0]) {
    // Generated metadata is small and does not need a resumable session.
    if (!input.source) return super.putObject(input);
    const target = this.target(input.destinationKey);
    const existing = await this.remoteProperties(target);
    const checksum = `SHA256:${input.sha256}`;
    if (existing) {
      if (existing.byteSize === input.source.byteSize && existing.checksum?.toUpperCase() === checksum.toUpperCase()) return { remoteId: target.toString(), etag: existing.etag ?? undefined, transferSessionId: null };
      throw new SyncDestinationError('A different file already exists at this immutable backup path', 'REMOTE_CONFLICT', 412);
    }
    await this.ensureCollections(input.destinationKey);
    const sessionId = input.resume?.transferSessionId ?? randomUUID();
    await this.ensureUploadSession(sessionId);
    await input.resume?.onProgress({ transferSessionId: sessionId, bytesTransferred: 0 });
    const existingChunks = await this.existingChunks(sessionId);
    let completed = 0;
    for (let start = 0; start < input.source.byteSize; start += NEXTCLOUD_CHUNK_BYTES) {
      const end = Math.min(input.source.byteSize - 1, start + NEXTCLOUD_CHUNK_BYTES - 1);
      const chunkName = nextcloudChunkName(start, end);
      const length = end - start + 1;
      if (existingChunks.get(chunkName) !== length) await this.uploadChunk(input, sessionId, start, end, chunkName);
      completed += length;
      await input.resume?.onProgress({ transferSessionId: sessionId, bytesTransferred: completed });
    }
    const move = await this.request(this.uploadTarget(sessionId, '.file'), { method: 'MOVE', headers: this.headers({ Destination: target.toString(), Overwrite: 'F', 'OC-Checksum': checksum }) }, input.signal);
    if (!move.ok) {
      const afterMove = await this.remoteProperties(target);
      if (!afterMove || afterMove.byteSize !== input.source.byteSize || afterMove.checksum?.toUpperCase() !== checksum.toUpperCase()) throw classifyStatus(move.status);
    }
    return { remoteId: target.toString(), etag: move.headers.get('oc-etag') ?? move.headers.get('etag') ?? undefined, transferSessionId: null };
  }
}

type GoogleCredentials = { accessToken: string; refreshToken: string; accessTokenExpiresAt?: string | null };

class GoogleDriveSyncDestination implements SyncDestination {
  private rootFolderId: string | null = null;
  constructor(private readonly connectionId: string, private readonly rootPath: string | null, private credentials: GoogleCredentials) {}
  private async saveCredentials() { await db.update(userStorageConnections).set({ credentialsEncrypted: encryptSyncSecret(JSON.stringify(this.credentials)), updatedAt: new Date() }).where(eq(userStorageConnections.id, this.connectionId)); }
  private async refreshToken() {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: googleClientId ?? '', client_secret: googleClientSecret ?? '', refresh_token: this.credentials.refreshToken, grant_type: 'refresh_token' }) });
    const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!response.ok || !data.access_token) throw new Error(`Google Drive authorization failed: ${data.error_description ?? 'reconnect Google Drive'}`);
    this.credentials.accessToken = data.access_token; this.credentials.accessTokenExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(); await this.saveCredentials();
  }
  private async authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) { const expiresAt = this.credentials.accessTokenExpiresAt ? new Date(this.credentials.accessTokenExpiresAt).getTime() : 0; if (!this.credentials.accessToken || expiresAt <= Date.now() + 60_000) await this.refreshToken(); const request = () => fetch(input, { ...init, headers: { ...init.headers, Authorization: `Bearer ${this.credentials.accessToken}` }, redirect: 'error' }); let response = await request(); if (response.status === 401) { await this.refreshToken(); response = await request(); } return response; }
  private async findOrCreateFolder(name: string, parentId?: string) { const escapedName = name.replace(/'/g, "\\'"); const query = [`name = '${escapedName}'`, "mimeType = 'application/vnd.google-apps.folder'", 'trashed = false', parentId ? `'${parentId}' in parents` : ''].filter(Boolean).join(' and '); const list = await this.authorizedFetch(`https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q: query, fields: 'files(id)', pageSize: '1' })}`); const result = await list.json().catch(() => ({})) as { files?: { id: string }[] }; if (list.ok && result.files?.[0]) return result.files[0].id; const create = await this.authorizedFetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }) }); const created = await create.json().catch(() => ({})) as { id?: string; error?: { message?: string } }; if (!create.ok || !created.id) throw new Error(`Google Drive folder creation failed: ${created.error?.message ?? create.status}`); return created.id; }
  private async folderFor(key: string) { if (!this.rootFolderId) this.rootFolderId = await this.findOrCreateFolder(this.rootPath || 'TailCache Backups'); let folderId = this.rootFolderId; for (const part of key.split('/').slice(0, -1).filter(Boolean)) folderId = await this.findOrCreateFolder(part, folderId); return folderId; }
  async testConnection() { const response = await this.authorizedFetch('https://www.googleapis.com/drive/v3/about?fields=user'); if (!response.ok) throw new Error(`Google Drive connection failed (${response.status})`); await this.folderFor('connection-check'); }
  private async findFile(destinationKey: string) { const folderId = await this.folderFor(destinationKey); const name = destinationKey.split('/').pop()?.replace(/'/g, "\\'") ?? ''; const query = `name = '${name}' and '${folderId}' in parents and trashed = false`; const response = await this.authorizedFetch(`https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q: query, fields: 'files(id)', pageSize: '1' })}`); const data = await response.json().catch(() => ({})) as { files?: { id: string }[] }; return response.ok ? data.files?.[0]?.id ?? null : null; }
  async exists(destinationKey: string) { return Boolean(await this.findFile(destinationKey)); }
  async putObject(input: Parameters<SyncDestination['putObject']>[0]) { const existingId = await this.findFile(input.destinationKey); if (!input.overwrite && existingId) return { remoteId: existingId }; const folderId = await this.folderFor(input.destinationKey); const name = input.destinationKey.split('/').pop() ?? 'file'; const boundary = `pdam-${crypto.randomUUID()}`; const body = input.body ?? await readSource(input.source); const prefix = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId], appProperties: { sha256: input.sha256 } })}\r\n--${boundary}\r\nContent-Type: ${input.contentType}\r\n\r\n`); const suffix = Buffer.from(`\r\n--${boundary}--`); const response = await this.authorizedFetch(`https://www.googleapis.com/upload/drive/v3/files${existingId ? `/${existingId}` : ''}?uploadType=multipart&fields=id,md5Checksum`, { method: existingId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: Buffer.concat([prefix, body, suffix]), signal: input.signal }); const data = await response.json().catch(() => ({})) as { id?: string; md5Checksum?: string; error?: { message?: string } }; if (!response.ok || !data.id) throw new Error(`Google Drive upload failed: ${data.error?.message ?? response.status}`); return { remoteId: data.id, etag: data.md5Checksum }; }
}

export async function createSyncDestination(connection: { id: string; providerType: string; rootPath: string | null; credentialsEncrypted: string | null }): Promise<SyncDestination> {
  if (!connection.credentialsEncrypted) throw new Error('Destination credentials are missing');
  const credentials = JSON.parse(decryptSyncSecret(connection.credentialsEncrypted)) as Record<string, string | boolean>;
  if (connection.providerType === 's3') { const client = new S3Client({ endpoint: String(credentials.endpoint), region: String(credentials.region || 'auto'), forcePathStyle: credentials.forcePathStyle !== false, credentials: { accessKeyId: String(credentials.accessKeyId), secretAccessKey: String(credentials.secretAccessKey) } }); return new S3SyncDestination(client, String(credentials.bucket), connection.rootPath ?? undefined); }
  if (connection.providerType === 'webdav' || connection.providerType === 'nextcloud') { const url = await validateWebdavUrl(String(credentials.endpoint)); return connection.providerType === 'nextcloud' ? new NextcloudSyncDestination(url, String(credentials.username), String(credentials.password), connection.rootPath ?? undefined) : new WebdavSyncDestination(url, String(credentials.username), String(credentials.password), connection.rootPath ?? undefined); }
  if (connection.providerType === 'google-drive') return new GoogleDriveSyncDestination(connection.id, connection.rootPath, credentials as unknown as GoogleCredentials);
  throw new Error(`Unsupported sync destination: ${connection.providerType}`);
}

import { S3Client, PutObjectCommand, HeadBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import dns from 'node:dns/promises';
import net from 'node:net';
import { decryptSyncSecret } from './sync-secrets';

export interface SyncDestination {
  testConnection(): Promise<void>;
  putObject(input: { destinationKey: string; body: Buffer; contentType: string; sha256: string; signal?: AbortSignal }): Promise<{ remoteId?: string; etag?: string }>;
  exists(destinationKey: string): Promise<boolean>;
}

function joinPath(...parts: (string | null | undefined)[]) { return parts.filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\//, ''); }

class S3SyncDestination implements SyncDestination {
  constructor(private readonly client: S3Client, private readonly bucket: string, private readonly root?: string) {}
  async testConnection() { await this.client.send(new HeadBucketCommand({ Bucket: this.bucket })); }
  async exists(destinationKey: string) { try { await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: joinPath(this.root, destinationKey) })); return true; } catch { return false; } }
  async putObject(input: { destinationKey: string; body: Buffer; contentType: string; sha256: string; signal?: AbortSignal }) {
    const key = joinPath(this.root, input.destinationKey);
    if (await this.exists(input.destinationKey)) return { remoteId: key };
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
  async putObject(input: { destinationKey: string; body: Buffer; contentType: string; sha256: string; signal?: AbortSignal }) {
    if (await this.exists(input.destinationKey)) return { remoteId: this.target(input.destinationKey).toString() };
    await this.ensureCollections(input.destinationKey);
    const target = this.target(input.destinationKey);
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(target, { method: 'PUT', headers: this.headers({ 'Content-Type': input.contentType, 'Content-Length': String(input.body.length), 'X-PDAM-SHA256': input.sha256, 'If-None-Match': '*' }), body: new Uint8Array(input.body), redirect: 'error', signal: input.signal });
      if (response.ok) return { remoteId: target.toString(), etag: response.headers.get('etag') ?? undefined };
      lastStatus = response.status;
      if (![423, 429, 500, 502, 503, 504].includes(response.status)) break;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
    if (lastStatus === 423) throw new Error('WebDAV upload failed (423 Locked): the destination file or folder is locked; retry after the other WebDAV client finishes');
    throw new Error(`WebDAV upload failed (${lastStatus})`);
  }
}

export async function createSyncDestination(connection: { providerType: string; rootPath: string | null; credentialsEncrypted: string | null }): Promise<SyncDestination> {
  if (!connection.credentialsEncrypted) throw new Error('Destination credentials are missing');
  const credentials = JSON.parse(decryptSyncSecret(connection.credentialsEncrypted)) as Record<string, string | boolean>;
  if (connection.providerType === 's3') {
    const client = new S3Client({ endpoint: String(credentials.endpoint), region: String(credentials.region ?? 'auto'), forcePathStyle: credentials.forcePathStyle !== false, credentials: { accessKeyId: String(credentials.accessKeyId), secretAccessKey: String(credentials.secretAccessKey) } });
    return new S3SyncDestination(client, String(credentials.bucket), connection.rootPath ?? undefined);
  }
  if (connection.providerType === 'webdav') {
    const url = await validateWebdavUrl(String(credentials.endpoint));
    return new WebdavSyncDestination(url, String(credentials.username), String(credentials.password), connection.rootPath ?? undefined);
  }
  throw new Error(`Unsupported sync destination: ${connection.providerType}`);
}

import { LocalStorageProvider } from './storage-local';
import { S3StorageProvider } from './storage-s3';

export interface StorageProvider {
  put(key: string, data: Buffer | Uint8Array): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
  getPresignedUrl(key: string, options?: { expiresInSeconds?: number; contentDisposition?: string }): Promise<string>;
  exists(key: string): Promise<boolean>;
  readonly providerType: string;
  /** Returns a human-readable identifier (e.g. bucket name or local path) */
  readonly identifier: string;
}

function getEnv(name: string): string | undefined {
  // import.meta.env holds all .env values in Astro/Vite; also fall back to
  // process.env for values set explicitly on the shell.
  const fromMeta = (import.meta.env as Record<string, unknown>)[name];
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta;
  const fromProcess = process.env[name];
  if (typeof fromProcess === 'string' && fromProcess.length > 0) return fromProcess;
  return undefined;
}

function createStorageProvider(): StorageProvider {
  const endpoint = getEnv('S3_ENDPOINT');
  if (endpoint) {
    const bucket = getEnv('S3_BUCKET');
    const accessKeyId = getEnv('S3_ACCESS_KEY_ID');
    const secretAccessKey = getEnv('S3_SECRET_ACCESS_KEY');

    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'S3_ENDPOINT is set but S3_BUCKET, S3_ACCESS_KEY_ID, or S3_SECRET_ACCESS_KEY is missing',
      );
    }

    const region = getEnv('S3_REGION') ?? 'auto';
    const forcePathStyle = getEnv('S3_FORCE_PATH_STYLE') !== 'false';
    console.log(
      `[storage] Initializing S3StorageProvider`,
      JSON.stringify({
        endpoint,
        region,
        bucket,
        accessKeyId: accessKeyId.slice(0, 4) + '***',
        forcePathStyle,
        publicUrl: getEnv('S3_PUBLIC_URL') ?? '(auto)',
      }),
    );

    return new S3StorageProvider({
      endpoint,
      region,
      bucket,
      accessKeyId,
      secretAccessKey,
      forcePathStyle,
      publicUrl: getEnv('S3_PUBLIC_URL'),
    });
  }

  const uploadsDir = getEnv('UPLOADS_DIR') ?? './uploads';
  console.log(`[storage] Initializing LocalStorageProvider at ${uploadsDir}`);
  return new LocalStorageProvider(uploadsDir);
}

let _storage: StorageProvider | null = null;

/**
 * Returns the configured storage provider. Lazily initialized on first access
 * so env vars are read after Vite has loaded .env.
 */
export function getStorage(): StorageProvider {
  if (!_storage) {
    _storage = createStorageProvider();
  }
  return _storage;
}

/** Convenience export for callers that want the provider directly. */
export const storage = new Proxy({} as StorageProvider, {
  get(_target, prop, receiver) {
    return Reflect.get(getStorage(), prop, receiver);
  },
});

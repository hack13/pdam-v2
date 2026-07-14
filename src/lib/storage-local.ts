import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { copyFile, mkdir, open, readFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import type { StorageProvider } from './storage';

export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;
  readonly identifier: string;
  readonly supportsMultipartUpload = false;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.identifier = basePath;
    if (!existsSync(basePath)) {
      mkdirSync(basePath, { recursive: true });
    }
  }

  private resolvePath(key: string): string {
    if (!key || isAbsolute(key)) {
      throw new Error('Storage key must be a non-empty relative path');
    }

    const basePath = normalize(this.basePath);
    const filePath = normalize(join(basePath, key));
    const relativePath = relative(basePath, filePath);
    if (relativePath === '..' || relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
      throw new Error('Storage key must remain within the storage directory');
    }

    return filePath;
  }

  async put(key: string, data: Buffer | Uint8Array): Promise<string> {
    const filePath = this.resolvePath(key);
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const writeStream = createWriteStream(filePath);
    await pipeline(Readable.from(data), writeStream);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const filePath = this.resolvePath(key);
    return await readFile(filePath);
  }

  async getObjectStream(key: string, range?: { start?: number; end?: number }): Promise<AsyncIterable<Uint8Array>> {
    const filePath = this.resolvePath(key);
    const file = await open(filePath, 'r');
    const stream = file.createReadStream({ start: range?.start, end: range?.end });
    stream.once('close', () => { void file.close(); });
    return stream;
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const sourcePath = this.resolvePath(sourceKey);
    const destinationPath = this.resolvePath(destinationKey);
    await mkdir(destinationPath.substring(0, destinationPath.lastIndexOf('/')), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }

  getPublicUrl(key: string): string {
    return `/uploads/${key}`;
  }

  async getPresignedUrl(_key: string, _options?: { expiresInSeconds?: number; contentDisposition?: string }): Promise<string> {
    return this.getPublicUrl(_key);
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolvePath(key);
    return existsSync(filePath);
  }

  get providerType(): string {
    return 'local';
  }
}

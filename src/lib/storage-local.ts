import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import type { StorageProvider } from './storage';

export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;
  readonly identifier: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.identifier = basePath;
    if (!existsSync(basePath)) {
      mkdirSync(basePath, { recursive: true });
    }
  }

  private resolvePath(key: string): string {
    return join(this.basePath, key);
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

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
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

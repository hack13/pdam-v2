import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider } from './storage';

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  publicUrl?: string;
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlPrefix: string;
  readonly identifier: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.identifier = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    if (config.publicUrl) {
      const trimmed = config.publicUrl.replace(/\/+$/, '');
      this.publicUrlPrefix = trimmed;
    } else {
      const endpoint = config.endpoint.replace(/\/+$/, '');
      if (config.forcePathStyle === false) {
        const url = new URL(endpoint);
        this.publicUrlPrefix = `${url.protocol}//${config.bucket}.${url.host}${url.pathname === '/' ? '' : url.pathname}`;
      } else {
        this.publicUrlPrefix = `${endpoint}/${config.bucket}`;
      }
    }
  }

  async put(key: string, data: Buffer | Uint8Array): Promise<string> {
    const body = data instanceof Uint8Array ? data : new Uint8Array(data);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
      }),
    );
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error(`S3 object not found: ${key}`);
    }

    const chunks: Uint8Array[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrlPrefix}/${key}`;
  }

  async getPresignedUrl(key: string, options?: { expiresInSeconds?: number; contentDisposition?: string }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(options?.contentDisposition && { ResponseContentDisposition: options.contentDisposition }),
    });
    return await getSignedUrl(this.client, command, { expiresIn: options?.expiresInSeconds ?? 3600 });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 || status === 403) {
        return false;
      }
      throw err;
    }
  }

  get providerType(): string {
    return 's3';
  }
}

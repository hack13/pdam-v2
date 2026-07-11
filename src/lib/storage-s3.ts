import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { MultipartPart, StorageProvider } from './storage';

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
  readonly supportsMultipartUpload = true;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.identifier = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? true,
      // Part URLs are consumed by the browser, which cannot provide the
      // SDK-generated checksum query parameters for the actual Blob body.
      // Only calculate request checksums when the operation explicitly
      // requires one; otherwise S3-compatible providers can reject the part
      // with 403/BadDigest.
      requestChecksumCalculation: 'WHEN_REQUIRED',
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
    const chunks: Uint8Array[] = [];
    for await (const chunk of await this.getObjectStream(key)) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getObjectStream(key: string, range?: { start?: number; end?: number }): Promise<AsyncIterable<Uint8Array>> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(range?.start !== undefined && {
          Range: `bytes=${range.start}-${range.end ?? ''}`,
        }),
      }),
    );

    if (!response.Body) {
      throw new Error(`S3 object not found: ${key}`);
    }

    return response.Body as AsyncIterable<Uint8Array>;
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

  async createMultipartUpload(key: string): Promise<string> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!response.UploadId) {
      throw new Error('Failed to create multipart upload');
    }

    return response.UploadId;
  }

  async getPresignedPartUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    options?: { expiresInSeconds?: number },
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    return await getSignedUrl(this.client, command, { expiresIn: options?.expiresInSeconds ?? 3600 });
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: MultipartPart[]): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.etag,
            })),
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  async listParts(key: string, uploadId: string): Promise<MultipartPart[]> {
    const parts: MultipartPart[] = [];
    let partNumberMarker: string | undefined;

    do {
      const response = await this.client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: partNumberMarker,
        }),
      );

      for (const part of response.Parts ?? []) {
        if (part.PartNumber && part.ETag) {
          parts.push({
            partNumber: part.PartNumber,
            etag: part.ETag,
          });
        }
      }

      if (!response.IsTruncated) break;
      partNumberMarker = response.NextPartNumberMarker;
    } while (partNumberMarker);

    return parts;
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

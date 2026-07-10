import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { globalFileBlobs, blobStorageObjects, fileThumbnails } from '../db/schema';
import { storage } from './storage';
import { isImageMimeType, generateThumbnail } from './image';

export interface StoredBlob {
  id: string;
  sha256: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface StoreFileResult {
  blob: StoredBlob;
  deduplicated: boolean;
  isNew: boolean;
}

export interface StoredThumbnail {
  id: string;
  blobId: string;
  width: number;
  height: number;
  mimeType: string;
  storageKey: string;
}

function computeSha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function computeShardedBlobKey(sha256: string): string {
  return `blobs/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}`;
}

/**
 * Multipart uploads must never write directly to a content-addressed blob key.
 * Until the server has verified the uploaded bytes, the client-provided digest
 * is untrusted and must not grant access to an existing blob.
 */
export function computePendingUploadKey(sessionId: string): string {
  return `pending-uploads/${sessionId}`;
}

export function isPendingUploadKey(storageKey: string): boolean {
  return storageKey.startsWith('pending-uploads/');
}

function computeShardedThumbnailKey(blobSha256: string, blobId: string): string {
  return `thumbnails/${blobSha256.slice(0, 2)}/${blobSha256.slice(2, 4)}/${blobId}.webp`;
}

function isOldBlobKey(key: string): boolean {
  return key.startsWith('blobs/') && key.split('/')[1]?.includes('-');
}

function isOldThumbnailKey(key: string): boolean {
  const afterPrefix = key.replace('thumbnails/', '');
  return !afterPrefix.includes('/') && afterPrefix.endsWith('.webp');
}

export async function findBlobBySha256(sha256: string): Promise<StoredBlob | null> {
  const existing = await db.query.globalFileBlobs.findFirst({
    where: eq(globalFileBlobs.sha256, sha256),
  });

  if (!existing) return null;

  return {
    id: existing.id,
    sha256: existing.sha256,
    fileName: existing.fileName,
    mimeType: existing.mimeType,
    fileSize: existing.fileSize,
  };
}

export async function storeFile(
  data: Buffer,
  fileName: string,
  mimeType: string
): Promise<StoreFileResult> {
  const sha256 = computeSha256(data);

  const existing = await findBlobBySha256(sha256);
  if (existing) {
    return {
      blob: existing,
      deduplicated: true,
      isNew: false,
    };
  }

  const blobId = randomUUID();
  const storageKey = computeShardedBlobKey(sha256);

  await storage.put(storageKey, data);

  const [blob] = await db.insert(globalFileBlobs).values({
    id: blobId,
    sha256,
    fileName,
    mimeType,
    fileSize: data.length,
  }).returning();

  await db.insert(blobStorageObjects).values({
    blobId,
    storageProviderType: storage.providerType,
    storageKey,
    bucketName: storage.identifier,
    physicalSizeBytes: data.length,
  });

  return {
    blob: {
      id: blob.id,
      sha256: blob.sha256,
      fileName: blob.fileName,
      mimeType: blob.mimeType,
      fileSize: blob.fileSize,
    },
    deduplicated: false,
    isNew: true,
  };
}

export async function finalizeBlobFromStorage(
  sha256: string,
  fileName: string,
  mimeType: string,
  fileSize: number,
  storageKey: string,
): Promise<StoreFileResult> {
  const existing = await findBlobBySha256(sha256);
  if (existing) {
    return {
      blob: existing,
      deduplicated: true,
      isNew: false,
    };
  }

  const objectExists = await storage.exists(storageKey);
  if (!objectExists) {
    throw new Error('Uploaded object not found in storage');
  }

  const blobId = randomUUID();

  const [blob] = await db.insert(globalFileBlobs).values({
    id: blobId,
    sha256,
    fileName,
    mimeType,
    fileSize,
  }).returning();

  await db.insert(blobStorageObjects).values({
    blobId,
    storageProviderType: storage.providerType,
    storageKey,
    bucketName: storage.identifier,
    physicalSizeBytes: fileSize,
  });

  return {
    blob: {
      id: blob.id,
      sha256: blob.sha256,
      fileName: blob.fileName,
      mimeType: blob.mimeType,
      fileSize: blob.fileSize,
    },
    deduplicated: false,
    isNew: true,
  };
}

export async function verifySha256FromStorage(
  storageKey: string,
  expectedSha256: string,
): Promise<{ hashValid: boolean; byteLength: number }> {
  if (!storage.getObjectStream) {
    throw new Error('Storage provider does not support streaming reads');
  }

  const hash = createHash('sha256');
  let byteLength = 0;
  for await (const chunk of await storage.getObjectStream(storageKey)) {
    hash.update(chunk);
    byteLength += chunk.byteLength;
  }

  return {
    hashValid: hash.digest('hex').toLowerCase() === expectedSha256.toLowerCase(),
    byteLength,
  };
}

export async function generateAndStoreThumbnail(
  blobId: string,
  sourceData: Buffer,
  sourceMimeType: string,
): Promise<StoredThumbnail | null> {
  if (!isImageMimeType(sourceMimeType)) {
    return null;
  }

  const thumbnail = await generateThumbnail(sourceData);
  const blob = await db.query.globalFileBlobs.findFirst({
    where: eq(globalFileBlobs.id, blobId),
  });
  if (!blob) throw new Error(`Blob not found: ${blobId}`);
  const thumbnailId = randomUUID();
  const storageKey = computeShardedThumbnailKey(blob.sha256, blobId);

  await storage.put(storageKey, thumbnail.data);

  const [record] = await db.insert(fileThumbnails).values({
    id: thumbnailId,
    blobId,
    width: thumbnail.width,
    height: thumbnail.height,
    mimeType: thumbnail.mimeType,
    storageKey,
  }).returning();

  return {
    id: record.id,
    blobId: record.blobId,
    width: record.width,
    height: record.height,
    mimeType: record.mimeType,
    storageKey: record.storageKey,
  };
}

export async function getThumbnailByKey(storageKey: string): Promise<Buffer | null> {
  try {
    if (isOldThumbnailKey(storageKey)) {
      const thumbnail = await db.query.fileThumbnails.findFirst({
        where: eq(fileThumbnails.storageKey, storageKey),
      });
      if (!thumbnail) return null;

      const blob = await db.query.globalFileBlobs.findFirst({
        where: eq(globalFileBlobs.id, thumbnail.blobId),
      });
      if (!blob) return null;

      const newKey = computeShardedThumbnailKey(blob.sha256, thumbnail.blobId);
      const data = await storage.get(storageKey);
      const exists = await storage.exists(newKey);
      if (!exists) {
        await storage.put(newKey, data);
      }
      await db.update(fileThumbnails)
        .set({ storageKey: newKey })
        .where(eq(fileThumbnails.id, thumbnail.id));
      await storage.delete(storageKey).catch(() => {});
      return data;
    }

    return await storage.get(storageKey);
  } catch {
    return null;
  }
}

export async function getFileByBlobId(blobId: string): Promise<{ data: Buffer; fileName: string; mimeType: string } | null> {
  const blob = await db.query.globalFileBlobs.findFirst({
    where: eq(globalFileBlobs.id, blobId),
  });
  if (!blob) return null;

  const storageObj = await db.query.blobStorageObjects.findFirst({
    where: eq(blobStorageObjects.blobId, blobId),
  });
  if (!storageObj) return null;

  if (isOldBlobKey(storageObj.storageKey)) {
    const newKey = computeShardedBlobKey(blob.sha256);
    const data = await storage.get(storageObj.storageKey);
    const exists = await storage.exists(newKey);
    if (!exists) {
      await storage.put(newKey, data);
    }
    await db.update(blobStorageObjects)
      .set({ storageKey: newKey })
      .where(eq(blobStorageObjects.blobId, blobId));
    await storage.delete(storageObj.storageKey).catch(() => {});
    return { data, fileName: blob.fileName, mimeType: blob.mimeType };
  }

  const data = await storage.get(storageObj.storageKey);
  return { data, fileName: blob.fileName, mimeType: blob.mimeType };
}

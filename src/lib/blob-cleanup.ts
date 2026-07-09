import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  userAssetFiles,
  globalFileBlobs,
  blobStorageObjects,
  fileThumbnails,
  productDescriptionImages,
} from '../db/schema';
import { storage } from './storage';

export async function cleanupUnreferencedBlobs(blobIds: string[]): Promise<number> {
  if (blobIds.length === 0) return 0;

  const stillReferencedFiles = await db.query.userAssetFiles.findMany({
    where: (table) => inArray(table.blobId, blobIds),
  });

  const stillReferencedThumbnails = await db.query.fileThumbnails.findMany({
    where: (table) => inArray(table.blobId, blobIds),
  });

  const stillReferencedDescriptionImages = await db.query.productDescriptionImages.findMany({
    where: (table) => inArray(table.blobId, blobIds),
  });

  const referencedBlobIds = new Set([
    ...stillReferencedFiles.map((file) => file.blobId),
    ...stillReferencedThumbnails.map((thumbnail) => thumbnail.blobId),
    ...stillReferencedDescriptionImages.map((image) => image.blobId),
  ]);

  const orphanedBlobIds = blobIds.filter((id) => !referencedBlobIds.has(id));

  if (orphanedBlobIds.length === 0) return 0;

  const storageObjs = await db.query.blobStorageObjects.findMany({
    where: (table) => inArray(table.blobId, orphanedBlobIds),
  });

  let physicalBytesFreed = 0;

  for (const obj of storageObjs) {
    try {
      await storage.delete(obj.storageKey);
      if (obj.physicalSizeBytes) {
        physicalBytesFreed += Number(obj.physicalSizeBytes);
      }
    } catch (err) {
      console.error(`Failed to delete storage object ${obj.storageKey}:`, err);
    }
  }

  if (storageObjs.length > 0) {
    await db.delete(blobStorageObjects).where(
      inArray(blobStorageObjects.blobId, orphanedBlobIds),
    );
  }

  await db.delete(globalFileBlobs).where(
    inArray(globalFileBlobs.id, orphanedBlobIds),
  );

  return physicalBytesFreed;
}

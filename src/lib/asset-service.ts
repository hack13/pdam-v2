import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  products,
  productVersions,
  userAssetFiles,
  globalFileBlobs,
  blobStorageObjects,
  fileThumbnails,
} from '../db/schema';
import { storage } from './storage';
import { updateStorageAccounting } from './storage-accounting';

export async function deleteAsset(productId: string, ownerId: string): Promise<void> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product || product.ownerUserId !== ownerId) {
    throw new Error('Asset not found');
  }

  const versions = await db.query.productVersions.findMany({
    where: eq(productVersions.productId, productId),
  });

  const versionIds = versions.map((v) => v.id);

  const affectedAssetFiles = versionIds.length > 0
    ? await db.query.userAssetFiles.findMany({
        where: (table) => inArray(table.productVersionId, versionIds),
      })
    : [];

  const affectedBlobIds = Array.from(new Set(affectedAssetFiles.map((f) => f.blobId)));

  // Calculate logical bytes to decrement for the user
  const logicalBytesToDecrement = affectedAssetFiles.reduce(
    (sum, f) => sum + Number(f.logicalSizeBytes),
    0,
  );

  if (affectedAssetFiles.length > 0) {
    await db.delete(userAssetFiles).where(
      inArray(userAssetFiles.productVersionId, versionIds),
    );
  }

  if (versionIds.length > 0) {
    await db.delete(productVersions).where(eq(productVersions.productId, productId));
  }

  // Cleanup unreferenced blobs and track physical bytes freed
  let physicalBytesFreed = await cleanupUnreferencedBlobs(affectedBlobIds);

  if (product.thumbnailFileThumbnailId) {
    const thumbnail = await db.query.fileThumbnails.findFirst({
      where: eq(fileThumbnails.id, product.thumbnailFileThumbnailId),
    });

    if (thumbnail) {
      await storage.delete(thumbnail.storageKey).catch(() => {});
      await db.delete(fileThumbnails).where(eq(fileThumbnails.id, thumbnail.id));
      const thumbnailPhysicalFreed = await cleanupUnreferencedBlobs([thumbnail.blobId]);
      physicalBytesFreed += thumbnailPhysicalFreed;
    }
  }

  // Update storage accounting for the user
  await updateStorageAccounting({
    userId: ownerId,
    logicalSizeDelta: -logicalBytesToDecrement,
    physicalSizeDelta: -physicalBytesFreed,
  });

  await db.delete(products).where(eq(products.id, productId));
}

export async function cleanupUnreferencedBlobs(blobIds: string[]): Promise<number> {
  if (blobIds.length === 0) return 0;

  const stillReferenced = await db.query.userAssetFiles.findMany({
    where: (table) => inArray(table.blobId, blobIds),
  });

  const referencedBlobIds = new Set(stillReferenced.map((f) => f.blobId));
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

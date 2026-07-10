import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  products,
  productVersions,
  userAssetFiles,
  userLibraryItems,
  fileThumbnails,
} from '../db/schema';
import { storage } from './storage';
import { updateStorageAccounting } from './storage-accounting';
import { cleanupUnreferencedBlobs } from './blob-cleanup';
import { deleteAllDescriptionImagesForProduct } from './description-images';

export async function deleteAsset(productId: string, ownerId: string): Promise<void> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product || product.ownerUserId !== ownerId) {
    throw new Error('Asset not found');
  }

  // Detach any buyer linked copies that pointed at this product as their source
  await db
    .update(products)
    .set({ sourceProductId: null, updatedAt: new Date() })
    .where(eq(products.sourceProductId, productId));

  await db.delete(userLibraryItems).where(eq(userLibraryItems.productId, productId));

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

  const thumbnailId = product.thumbnailFileThumbnailId;
  if (thumbnailId) {
    // Clear this product's FK first so we can safely delete the thumbnail row.
    // Linked copies may share the same thumbnail — only remove it when unused.
    await db
      .update(products)
      .set({
        thumbnailFileThumbnailId: null,
        featuredThumbnailKey: null,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));

    const stillReferenced = await db.query.products.findFirst({
      where: eq(products.thumbnailFileThumbnailId, thumbnailId),
      columns: { id: true },
    });

    if (!stillReferenced) {
      const thumbnail = await db.query.fileThumbnails.findFirst({
        where: eq(fileThumbnails.id, thumbnailId),
      });

      if (thumbnail) {
        await storage.delete(thumbnail.storageKey).catch(() => {});
        await db.delete(fileThumbnails).where(eq(fileThumbnails.id, thumbnail.id));
        const thumbnailPhysicalFreed = await cleanupUnreferencedBlobs([thumbnail.blobId]);
        physicalBytesFreed += thumbnailPhysicalFreed;
      }
    }
  }

  await deleteAllDescriptionImagesForProduct(productId, ownerId);

  // Update storage accounting for the user
  await updateStorageAccounting({
    userId: ownerId,
    logicalSizeDelta: -logicalBytesToDecrement,
    physicalSizeDelta: -physicalBytesFreed,
  });

  await db.delete(products).where(eq(products.id, productId));
}

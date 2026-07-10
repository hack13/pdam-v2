import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  products,
  productVersions,
  userAssetFiles,
  userLibraryItems,
  ownershipVerifications,
} from '../db/schema';
import { slugify } from './api-helpers';
import { updateStorageAccounting } from './storage-accounting';

async function uniqueSlugForUser(userId: string, title: string): Promise<string> {
  const baseSlug = slugify(title);
  let slug = baseSlug;
  let counter = 0;
  while (true) {
    const existing = await db.query.products.findFirst({
      where: and(eq(products.ownerUserId, userId), eq(products.slug, slug)),
    });
    if (!existing) return slug;
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

/**
 * Creates a buyer-owned linked copy of a gallery listing, cloning versions
 * and file refs (same blobs). The buyer can download but not edit the source.
 */
export async function createLinkedCopy(params: {
  sourceProductId: string;
  buyerUserId: string;
  marketplaceSourceId: string;
  licenseKey: string;
  externalPurchaseId?: string | null;
}): Promise<{ linkedProductId: string; libraryItemId: string }> {
  const source = await db.query.products.findFirst({
    where: eq(products.id, params.sourceProductId),
  });

  if (!source || !source.isGalleryListed) {
    throw new Error('Gallery listing not found');
  }

  const existingLink = await db.query.products.findFirst({
    where: and(
      eq(products.ownerUserId, params.buyerUserId),
      eq(products.sourceProductId, params.sourceProductId),
    ),
  });
  if (existingLink) {
    throw new Error('You already have this asset in your library');
  }

  const slug = await uniqueSlugForUser(params.buyerUserId, source.title);
  const now = new Date();

  const [linked] = await db
    .insert(products)
    .values({
      title: source.title,
      slug,
      descriptionText: source.descriptionText,
      descriptionHtml: source.descriptionHtml,
      tags: source.tags,
      creatorIds: source.creatorIds,
      thumbnailFileThumbnailId: source.thumbnailFileThumbnailId,
      featuredThumbnailKey: source.featuredThumbnailKey,
      marketplaceSourceId: params.marketplaceSourceId,
      licenseKey: params.licenseKey,
      productUrl: source.productUrl,
      ownerUserId: params.buyerUserId,
      sourceProductId: source.id,
      isGalleryListed: false,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const [libraryItem] = await db
    .insert(userLibraryItems)
    .values({
      userId: params.buyerUserId,
      productId: linked.id,
      marketplaceSourceId: params.marketplaceSourceId,
      licenseKey: params.licenseKey,
      externalPurchaseId: params.externalPurchaseId ?? null,
      acquiredAt: now,
    })
    .returning();

  await syncLinkedCopyFromSource(linked.id, params.buyerUserId);

  return { linkedProductId: linked.id, libraryItemId: libraryItem.id };
}

/**
 * Copies any missing versions/files from the source gallery listing onto the
 * buyer's linked copy. Shared blobs — only logical storage is charged to buyer.
 */
export async function syncLinkedCopyFromSource(
  linkedProductId: string,
  ownerUserId: string,
): Promise<{ addedVersions: number; addedFiles: number }> {
  const linked = await db.query.products.findFirst({
    where: eq(products.id, linkedProductId),
  });

  if (!linked || linked.ownerUserId !== ownerUserId || !linked.sourceProductId) {
    throw new Error('Linked asset not found');
  }

  const source = await db.query.products.findFirst({
    where: eq(products.id, linked.sourceProductId),
  });
  if (!source) {
    throw new Error('Source listing no longer exists');
  }

  // Refresh metadata from source (title/description/tags/thumbnail)
  await db
    .update(products)
    .set({
      title: source.title,
      descriptionText: source.descriptionText,
      descriptionHtml: source.descriptionHtml,
      tags: source.tags,
      creatorIds: source.creatorIds,
      thumbnailFileThumbnailId: source.thumbnailFileThumbnailId,
      featuredThumbnailKey: source.featuredThumbnailKey,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(products.id, linked.id));

  const sourceVersions = await db.query.productVersions.findMany({
    where: eq(productVersions.productId, source.id),
  });

  const linkedVersions = await db.query.productVersions.findMany({
    where: eq(productVersions.productId, linked.id),
  });
  const linkedByVersion = new Map(linkedVersions.map((v) => [v.version, v]));

  let addedVersions = 0;
  let addedFiles = 0;
  let logicalBytesAdded = 0;

  for (const sourceVersion of sourceVersions) {
    let targetVersion = linkedByVersion.get(sourceVersion.version);

    if (!targetVersion) {
      const [created] = await db
        .insert(productVersions)
        .values({
          productId: linked.id,
          version: sourceVersion.version,
          releaseNotes: sourceVersion.releaseNotes,
          publishedAt: sourceVersion.publishedAt,
        })
        .returning();
      targetVersion = created;
      linkedByVersion.set(sourceVersion.version, created);
      addedVersions++;
    }

    const sourceFiles = await db.query.userAssetFiles.findMany({
      where: and(
        eq(userAssetFiles.productVersionId, sourceVersion.id),
        eq(userAssetFiles.userId, source.ownerUserId!),
      ),
    });

    const existingBuyerFiles = await db.query.userAssetFiles.findMany({
      where: and(
        eq(userAssetFiles.productVersionId, targetVersion.id),
        eq(userAssetFiles.userId, ownerUserId),
      ),
    });
    const existingBlobIds = new Set(existingBuyerFiles.map((f) => f.blobId));

    for (const file of sourceFiles) {
      if (existingBlobIds.has(file.blobId)) continue;

      await db.insert(userAssetFiles).values({
        userId: ownerUserId,
        productVersionId: targetVersion.id,
        blobId: file.blobId,
        logicalSizeBytes: file.logicalSizeBytes,
        isBackedUp: false,
      });
      addedFiles++;
      logicalBytesAdded += Number(file.logicalSizeBytes);
    }
  }

  if (logicalBytesAdded > 0) {
    await updateStorageAccounting({
      userId: ownerUserId,
      logicalSizeDelta: logicalBytesAdded,
      physicalSizeDelta: 0,
    });
  }

  return { addedVersions, addedFiles };
}

export async function recordVerifiedOwnership(params: {
  userId: string;
  productId: string;
  marketplaceSourceId: string;
  licenseKey: string;
  linkedProductId: string;
  externalPurchaseId?: string | null;
}) {
  const existing = await db.query.ownershipVerifications.findFirst({
    where: and(
      eq(ownershipVerifications.userId, params.userId),
      eq(ownershipVerifications.productId, params.productId),
    ),
  });

  const now = new Date();

  if (existing) {
    await db
      .update(ownershipVerifications)
      .set({
        marketplaceSourceId: params.marketplaceSourceId,
        licenseKey: params.licenseKey,
        status: 'verified',
        failureReason: null,
        linkedProductId: params.linkedProductId,
        verifiedAt: now,
        updatedAt: now,
      })
      .where(eq(ownershipVerifications.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(ownershipVerifications)
    .values({
      userId: params.userId,
      productId: params.productId,
      marketplaceSourceId: params.marketplaceSourceId,
      licenseKey: params.licenseKey,
      status: 'verified',
      linkedProductId: params.linkedProductId,
      verifiedAt: now,
    })
    .returning();
  return row.id;
}

export async function countOwnershipConfirmations(creatorUserId: string): Promise<number> {
  const listed = await db.query.products.findMany({
    where: and(
      eq(products.ownerUserId, creatorUserId),
      eq(products.isGalleryListed, true),
    ),
    columns: { id: true },
  });
  if (listed.length === 0) return 0;

  const rows = await db.query.ownershipVerifications.findMany({
    where: and(
      inArray(
        ownershipVerifications.productId,
        listed.map((p) => p.id),
      ),
      eq(ownershipVerifications.status, 'verified'),
    ),
    columns: { id: true },
  });
  return rows.length;
}

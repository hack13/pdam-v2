import { and, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../db';
import { fileThumbnails, globalFileBlobs, productVersions, products, userAssetFiles } from '../db/schema';

export const SYNC_MANIFEST_VERSION = 1;

function encodeCursor(date: Date, id: string) {
  return Buffer.from(JSON.stringify({ t: date.toISOString(), id })).toString('base64url');
}

function decodeCursor(cursor: string | null) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t?: string; id?: string };
    if (!parsed.t || !parsed.id) return null;
    return { date: new Date(parsed.t), id: parsed.id };
  } catch { return null; }
}

export async function buildSyncManifest(userId: string, cursor: string | null = null) {
  const decoded = decodeCursor(cursor);
  const ownedProducts = await db.query.products.findMany({
    where: decoded ? and(eq(products.ownerUserId, userId), gt(products.updatedAt, decoded.date)) : eq(products.ownerUserId, userId),
    orderBy: (table, { asc }) => [asc(table.updatedAt), asc(table.id)],
  });
  const productIds = ownedProducts.map((product) => product.id);
  const versions = productIds.length ? await db.query.productVersions.findMany({ where: inArray(productVersions.productId, productIds) }) : [];
  const thumbnailIds = ownedProducts.flatMap((product) => product.thumbnailFileThumbnailId ? [product.thumbnailFileThumbnailId] : []);
  const thumbnails = thumbnailIds.length ? await db.query.fileThumbnails.findMany({ where: inArray(fileThumbnails.id, thumbnailIds) }) : [];
  const versionIds = versions.map((version) => version.id);
  const files = versionIds.length ? await db.query.userAssetFiles.findMany({ where: and(eq(userAssetFiles.userId, userId), inArray(userAssetFiles.productVersionId, versionIds)) }) : [];
  const blobIds = [...new Set([
    ...files.map((file) => file.blobId),
    ...thumbnails.map((thumbnail) => thumbnail.blobId),
  ])];
  const blobs = blobIds.length ? await db.query.globalFileBlobs.findMany({ where: inArray(globalFileBlobs.id, blobIds) }) : [];
  const blobsById = new Map(blobs.map((blob) => [blob.id, blob]));
  const thumbnailsById = new Map(thumbnails.map((thumbnail) => [thumbnail.id, thumbnail]));
  const versionsByProduct = new Map<string, typeof versions>();
  for (const version of versions) versionsByProduct.set(version.productId, [...(versionsByProduct.get(version.productId) ?? []), version]);
  const filesByVersion = new Map<string, typeof files>();
  for (const file of files) filesByVersion.set(file.productVersionId!, [...(filesByVersion.get(file.productVersionId!) ?? []), file]);

  const assets = ownedProducts.map((product) => ({
    id: product.id,
    title: product.title,
    slug: product.slug,
    descriptionHtml: product.descriptionHtml,
    descriptionText: product.descriptionText,
    tags: product.tags,
    licenseKey: product.licenseKey,
    thumbnailPath: thumbnailsById.has(product.thumbnailFileThumbnailId ?? '') ? `assets/${product.slug}/thumbnail.webp` : null,
    thumbnail: (() => {
      const thumbnail = thumbnailsById.get(product.thumbnailFileThumbnailId ?? '');
      return thumbnail ? { id: thumbnail.id, blobId: thumbnail.blobId, mimeType: thumbnail.mimeType, storageKey: thumbnail.storageKey, downloadUrl: `/api/sync/thumbnails/${thumbnail.id}` } : null;
    })(),
    updatedAt: product.updatedAt.toISOString(),
    versions: (versionsByProduct.get(product.id) ?? []).map((version) => ({
      id: version.id,
      version: version.version,
      releaseNotes: version.releaseNotes,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      createdAt: version.createdAt.toISOString(),
      files: (filesByVersion.get(version.id) ?? []).flatMap((file) => {
        const blob = blobsById.get(file.blobId);
        if (!blob) return [];
        return [{
          id: file.id,
          blobId: blob.id,
          sha256: blob.sha256,
          fileName: blob.fileName,
          mimeType: blob.mimeType,
          byteSize: blob.fileSize,
          assetId: product.id,
          versionId: version.id,
          downloadUrl: `/api/sync/files/${blob.id}`,
        }];
      }),
    })),
  }));
  const newest = ownedProducts.at(-1);
  return {
    schemaVersion: SYNC_MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    assets,
    nextCursor: newest ? encodeCursor(newest.updatedAt, newest.id) : cursor,
    hasMore: ownedProducts.length >= 100,
  };
}

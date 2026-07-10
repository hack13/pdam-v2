import type { APIContext } from 'astro';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { products, productVersions, userAssetFiles } from '../db/schema';
import { jsonError } from './api-helpers';
import type { StoredBlob } from './file-pipeline';
import { updateStorageAccounting } from './storage-accounting';

export async function validateVersionAccess(
  userId: string,
  productId: string,
  versionId: string,
  options: { allowLinkedCopyMutation?: boolean } = {},
): Promise<{ product: typeof products.$inferSelect; version: typeof productVersions.$inferSelect } | Response> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product || product.ownerUserId !== userId) {
    return jsonError('Asset not found', 404);
  }

  if (product.sourceProductId && !options.allowLinkedCopyMutation) {
    return jsonError(
      'Linked copies cannot be modified — sync updates from the creator instead',
      403,
    );
  }

  const version = await db.query.productVersions.findFirst({
    where: and(
      eq(productVersions.id, versionId),
      eq(productVersions.productId, productId),
    ),
  });

  if (!version) {
    return jsonError('Version not found', 404);
  }

  return { product, version };
}

export async function linkBlobToVersion(
  userId: string,
  versionId: string,
  blob: StoredBlob,
  fileSize: number,
  isNew: boolean,
): Promise<{ id: string; blobId: string }> {
  const [userAssetFile] = await db.insert(userAssetFiles).values({
    userId,
    productVersionId: versionId,
    blobId: blob.id,
    logicalSizeBytes: fileSize,
  }).returning();

  await updateStorageAccounting({
    userId,
    logicalSizeDelta: fileSize,
    physicalSizeDelta: isNew ? fileSize : 0,
  });

  return {
    id: userAssetFile.id,
    blobId: userAssetFile.blobId,
  };
}

export function parseJsonBody<T extends object>(body: unknown): T | null {
  if (!body || typeof body !== 'object') return null;
  return body as T;
}

export async function readJsonBody<T extends object>(context: APIContext): Promise<T | Response> {
  try {
    const body = await context.request.json();
    const parsed = parseJsonBody<T>(body);
    if (!parsed) return jsonError('Invalid JSON body');
    return parsed;
  } catch {
    return jsonError('Invalid JSON body');
  }
}

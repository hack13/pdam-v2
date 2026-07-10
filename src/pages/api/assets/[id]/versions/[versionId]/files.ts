import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../../../db';
import { products, productVersions, userAssetFiles, globalFileBlobs, blobStorageObjects } from '../../../../../../db/schema';
import { requireAuth, json, jsonError } from '../../../../../../lib/api-helpers';
import { storeFile, getFileByBlobId } from '../../../../../../lib/file-pipeline';
import { updateStorageAccounting } from '../../../../../../lib/storage-accounting';
import { cleanupUnreferencedBlobs } from '../../../../../../lib/blob-cleanup';
import { storage } from '../../../../../../lib/storage';
import { getMaxUploadBytes } from '../../../../../../lib/upload-config';

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  const versionId = context.params.versionId;
  if (!productId || !versionId) return jsonError('Asset ID and version ID required');

  const url = new URL(context.request.url);
  const blobId = url.searchParams.get('blobId');
  if (!blobId) return jsonError('blobId query parameter required');

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product || product.ownerUserId !== auth.user.id) {
    return jsonError('Asset not found', 404);
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

  const assetFile = await db.query.userAssetFiles.findFirst({
    where: and(
      eq(userAssetFiles.blobId, blobId),
      eq(userAssetFiles.productVersionId, versionId),
      eq(userAssetFiles.userId, auth.user.id),
    ),
  });

  if (!assetFile) {
    return jsonError('File not found', 404);
  }

  if (storage.providerType === 's3') {
    const [blob, storageObj] = await Promise.all([
      db.query.globalFileBlobs.findFirst({ where: eq(globalFileBlobs.id, blobId) }),
      db.query.blobStorageObjects.findFirst({ where: eq(blobStorageObjects.blobId, blobId) }),
    ]);

    if (!blob || !storageObj) {
      return jsonError('File data not found', 404);
    }

    const presignedUrl = await storage.getPresignedUrl(storageObj.storageKey, {
      expiresInSeconds: 300,
      contentDisposition: `attachment; filename="${blob.fileName}"`,
    });

    return context.redirect(presignedUrl, 302);
  }

  const fileData = await getFileByBlobId(blobId);
  if (!fileData) {
    return jsonError('File data not found', 404);
  }

  return new Response(new Uint8Array(fileData.data), {
    headers: {
      'Content-Type': fileData.mimeType,
      'Content-Disposition': `attachment; filename="${fileData.fileName}"`,
      'Content-Length': String(fileData.data.length),
    },
  });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  const versionId = context.params.versionId;
  if (!productId || !versionId) return jsonError('Asset ID and version ID required');

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product || product.ownerUserId !== auth.user.id) {
    return jsonError('Asset not found', 404);
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

  const form = await context.request.formData();
  const file = form.get('file');

  if (!file || !(file instanceof File)) {
    return jsonError('No file uploaded');
  }

  if (file.size === 0) {
    return jsonError('File is empty');
  }

  if (file.size > getMaxUploadBytes()) {
    return jsonError(`File must be under ${getMaxUploadBytes()} bytes`);
  }

  const data = Buffer.from(await file.arrayBuffer());
  const { blob, isNew } = await storeFile(data, file.name, file.type || 'application/octet-stream');

  const [userAssetFile] = await db.insert(userAssetFiles).values({
    userId: auth.user.id,
    productVersionId: versionId,
    blobId: blob.id,
    logicalSizeBytes: data.length,
  }).returning();

  // Update storage accounting - logical size always increases, physical only if new blob
  await updateStorageAccounting({
    userId: auth.user.id,
    logicalSizeDelta: data.length,
    physicalSizeDelta: isNew ? data.length : 0,
  });

  return json({
    success: true,
    file: {
      ...blob,
      userAssetFileId: userAssetFile.id,
    },
  });
};

// Alias: uploading a file to an asset version is also exposed as PUT.
export const PUT: APIRoute = POST;

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  const versionId = context.params.versionId;
  if (!productId || !versionId) return jsonError('Asset ID and version ID required');

  const url = new URL(context.request.url);
  const blobId = url.searchParams.get('blobId');
  if (!blobId) return jsonError('blobId query parameter required');

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product || product.ownerUserId !== auth.user.id) {
    return jsonError('Asset not found', 404);
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

  const assetFile = await db.query.userAssetFiles.findFirst({
    where: and(
      eq(userAssetFiles.blobId, blobId),
      eq(userAssetFiles.productVersionId, versionId),
      eq(userAssetFiles.userId, auth.user.id),
    ),
  });

  if (!assetFile) {
    return jsonError('File not found', 404);
  }

  const logicalBytesToDecrement = Number(assetFile.logicalSizeBytes);

  await db.delete(userAssetFiles).where(eq(userAssetFiles.id, assetFile.id));

  const physicalBytesFreed = await cleanupUnreferencedBlobs([blobId]);

  await updateStorageAccounting({
    userId: auth.user.id,
    logicalSizeDelta: -logicalBytesToDecrement,
    physicalSizeDelta: -physicalBytesFreed,
  });

  return json({ success: true });
};

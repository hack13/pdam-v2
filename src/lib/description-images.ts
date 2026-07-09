import { eq, inArray, and } from 'drizzle-orm';
import { db } from '../db';
import { products, productDescriptionImages } from '../db/schema';
import { storeFile, getFileByBlobId } from './file-pipeline';
import { isImageMimeType, processDescriptionImage } from './image';
import { updateStorageAccounting } from './storage-accounting';
import { cleanupUnreferencedBlobs } from './blob-cleanup';
import {
  descriptionImageUrl,
  extractReferencedDescriptionImageIds,
} from './description-image-url';

export const DESCRIPTION_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export interface UploadedDescriptionImage {
  id: string;
  url: string;
  width: number;
  height: number;
}

export async function uploadDescriptionImage(
  productId: string,
  ownerUserId: string,
  file: File,
): Promise<UploadedDescriptionImage> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product || product.ownerUserId !== ownerUserId) {
    throw new Error('Asset not found');
  }

  if (!file.type.startsWith('image/') || !isImageMimeType(file.type)) {
    throw new Error('File must be an image');
  }

  if (file.size > DESCRIPTION_IMAGE_MAX_BYTES) {
    throw new Error('Image must be under 10MB');
  }

  const sourceData = Buffer.from(await file.arrayBuffer());
  const processed = await processDescriptionImage(sourceData);
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
  const fileName = `${baseName}.webp`;

  const { blob } = await storeFile(processed.data, fileName, processed.mimeType);

  const [record] = await db.insert(productDescriptionImages).values({
    productId,
    blobId: blob.id,
    width: processed.width,
    height: processed.height,
    logicalSizeBytes: processed.data.length,
  }).returning();

  await updateStorageAccounting({
    userId: ownerUserId,
    logicalSizeDelta: processed.data.length,
    physicalSizeDelta: processed.data.length,
  });

  return {
    id: record.id,
    url: descriptionImageUrl(productId, record.id),
    width: record.width,
    height: record.height,
  };
}

export async function getDescriptionImageData(
  productId: string,
  imageId: string,
  ownerUserId: string,
): Promise<{ data: Buffer; mimeType: string } | null> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product || product.ownerUserId !== ownerUserId) {
    return null;
  }

  const image = await db.query.productDescriptionImages.findFirst({
    where: and(
      eq(productDescriptionImages.id, imageId),
      eq(productDescriptionImages.productId, productId),
    ),
  });

  if (!image) {
    return null;
  }

  const file = await getFileByBlobId(image.blobId);
  if (!file) {
    return null;
  }

  return { data: file.data, mimeType: file.mimeType };
}

async function deleteDescriptionImageRecords(
  images: Array<typeof productDescriptionImages.$inferSelect>,
  ownerUserId: string,
): Promise<void> {
  if (images.length === 0) return;

  const blobIds = images.map((image) => image.blobId);
  const logicalBytesFreed = images.reduce(
    (sum, image) => sum + Number(image.logicalSizeBytes),
    0,
  );

  await db.delete(productDescriptionImages).where(
    inArray(
      productDescriptionImages.id,
      images.map((image) => image.id),
    ),
  );

  const physicalBytesFreed = await cleanupUnreferencedBlobs(blobIds);

  await updateStorageAccounting({
    userId: ownerUserId,
    logicalSizeDelta: -logicalBytesFreed,
    physicalSizeDelta: -physicalBytesFreed,
  });
}

export async function reconcileDescriptionImages(
  productId: string,
  description: string,
  ownerUserId: string,
): Promise<void> {
  const referencedIds = extractReferencedDescriptionImageIds(description, productId);

  const existingImages = await db.query.productDescriptionImages.findMany({
    where: eq(productDescriptionImages.productId, productId),
  });

  const orphaned = existingImages.filter((image) => !referencedIds.has(image.id));
  await deleteDescriptionImageRecords(orphaned, ownerUserId);
}

export async function deleteAllDescriptionImagesForProduct(
  productId: string,
  ownerUserId: string,
): Promise<void> {
  const images = await db.query.productDescriptionImages.findMany({
    where: eq(productDescriptionImages.productId, productId),
  });

  await deleteDescriptionImageRecords(images, ownerUserId);
}

import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../../../db';
import { galleryListingMedia, products } from '../../../../../db/schema';
import { json, jsonError } from '../../../../../lib/api-helpers';
import { requireCreator } from '../../../../../lib/creator';
import { validateGalleryMediaUrl } from '../../../../../lib/gallery-media';
import { isImageMimeType, processDescriptionImage } from '../../../../../lib/image';
import { storage } from '../../../../../lib/storage';

async function getOwnedListing(productId: string, userId: string) {
  return db.query.products.findFirst({
    where: and(
      eq(products.id, productId),
      eq(products.ownerUserId, userId),
      eq(products.isGalleryListed, true),
      sql`${products.sourceProductId} is null`,
    ),
  });
}

async function nextSortOrder(productId: string) {
  const existing = await db.query.galleryListingMedia.findMany({
    where: eq(galleryListingMedia.productId, productId),
    columns: { sortOrder: true },
  });
  if (existing.length >= 12) return null;
  return existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
}

export const POST: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;
  const productId = context.params.id;
  if (!productId) return jsonError('Listing ID required');
  if (!(await getOwnedListing(productId, auth.user.id))) return jsonError('Listing not found', 404);

  const sortOrder = await nextSortOrder(productId);
  if (sortOrder === null) return jsonError('A listing can have up to 12 gallery items');

  const contentType = context.request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await context.request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) return jsonError('No image uploaded');
    if (!isImageMimeType(file.type)) return jsonError('Gallery uploads must be images');
    if (file.size > 20 * 1024 * 1024) return jsonError('Gallery images must be under 20MB');

    const id = randomUUID();
    const processed = await processDescriptionImage(Buffer.from(await file.arrayBuffer()));
    const storageKey = `gallery-media/${productId}/${id}.webp`;
    await storage.put(storageKey, processed.data);
    const [created] = await db.insert(galleryListingMedia).values({
      id,
      productId,
      mediaType: 'image',
      url: `/api/gallery-media/${id}`,
      storageKey,
      altText: String(form.get('altText') ?? '').trim().slice(0, 240) || null,
      caption: String(form.get('caption') ?? '').trim().slice(0, 300) || null,
      sortOrder,
    }).returning();
    return json({ media: created }, 201);
  }

  let body: { mediaType?: unknown; url?: unknown; altText?: unknown; caption?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }
  if (body.mediaType !== 'image' && body.mediaType !== 'video') {
    return jsonError('Media type must be image or video');
  }
  if (typeof body.url !== 'string' || !validateGalleryMediaUrl(body.url)) {
    return jsonError('Use a valid HTTP or HTTPS media URL');
  }

  const [created] = await db.insert(galleryListingMedia).values({
    productId,
    mediaType: body.mediaType,
    url: body.url.trim(),
    altText: typeof body.altText === 'string' ? body.altText.trim().slice(0, 240) || null : null,
    caption: typeof body.caption === 'string' ? body.caption.trim().slice(0, 300) || null : null,
    sortOrder,
  }).returning();
  return json({ media: created }, 201);
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;
  const productId = context.params.id;
  const mediaId = new URL(context.request.url).searchParams.get('mediaId');
  if (!productId || !mediaId) return jsonError('Listing and media IDs are required');
  if (!(await getOwnedListing(productId, auth.user.id))) return jsonError('Listing not found', 404);

  const media = await db.query.galleryListingMedia.findFirst({
    where: and(eq(galleryListingMedia.id, mediaId), eq(galleryListingMedia.productId, productId)),
  });
  if (!media) return jsonError('Media not found', 404);

  await db.delete(galleryListingMedia).where(eq(galleryListingMedia.id, media.id));
  if (media.storageKey) await storage.delete(media.storageKey).catch(() => undefined);
  return json({ success: true });
};

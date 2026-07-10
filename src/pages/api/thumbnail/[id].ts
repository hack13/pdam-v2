import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { fileThumbnails, products } from '../../../db/schema';
import { getSessionFromContext } from '../../../lib/session';
import { getThumbnailByKey } from '../../../lib/file-pipeline';

export const GET: APIRoute = async (context) => {
  const thumbnailId = context.params.id;
  if (!thumbnailId) {
    return new Response('Not found', { status: 404 });
  }

  const thumbnail = await db.query.fileThumbnails.findFirst({
    where: eq(fileThumbnails.id, thumbnailId),
  });

  if (!thumbnail) {
    return new Response('Not found', { status: 404 });
  }

  const product = await db.query.products.findFirst({
    where: eq(products.thumbnailFileThumbnailId, thumbnailId),
  });

  if (!product) {
    return new Response('Forbidden', { status: 403 });
  }

  // Gallery listings are publicly viewable (including thumbnails).
  const isPublicThumbnail = product.isGalleryListed;
  if (!isPublicThumbnail) {
    const session = await getSessionFromContext(context);
    if (!session?.user || product.ownerUserId !== session.user.id) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  const data = await getThumbnailByKey(thumbnail.storageKey);
  if (!data) {
    return new Response('Not found', { status: 404 });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'image/webp',
    // Gallery thumbnails are intentionally public. Private thumbnails may be
    // cached only by the user's browser, and only for a short period.
    'Cache-Control': isPublicThumbnail
      ? 'public, max-age=86400'
      : 'private, max-age=900',
  };

  if (!isPublicThumbnail) {
    // Keep a browser cache entry scoped to the authenticated session rather
    // than allowing it to be reused after a different user signs in.
    headers.Vary = 'Cookie';
  }

  return new Response(new Uint8Array(data), {
    status: 200,
    headers,
  });
};

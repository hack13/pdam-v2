import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
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

  const publicProduct = await db.query.products.findFirst({
    where: and(
      eq(products.thumbnailFileThumbnailId, thumbnailId),
      eq(products.isGalleryListed, true),
    ),
  });

  // A linked library copy can share a thumbnail with its public source. Check
  // for any published product before falling back to private ownership.
  const isPublicThumbnail = !!publicProduct;
  if (!isPublicThumbnail) {
    const session = await getSessionFromContext(context);
    if (!session?.user) {
      return new Response('Forbidden', { status: 403 });
    }
    const ownedProduct = await db.query.products.findFirst({
      where: and(
        eq(products.thumbnailFileThumbnailId, thumbnailId),
        eq(products.ownerUserId, session.user.id),
      ),
      columns: { id: true },
    });
    if (!ownedProduct) {
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

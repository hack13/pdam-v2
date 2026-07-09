import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { fileThumbnails, products } from '../../../db/schema';
import { getSessionFromContext } from '../../../lib/session';
import { getThumbnailByKey } from '../../../lib/file-pipeline';

export const GET: APIRoute = async (context) => {
  const session = await getSessionFromContext(context);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

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

  if (!product || product.ownerUserId !== session.user.id) {
    return new Response('Forbidden', { status: 403 });
  }

  const data = await getThumbnailByKey(thumbnail.storageKey);
  if (!data) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': thumbnail.mimeType,
      'Content-Length': String(data.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};

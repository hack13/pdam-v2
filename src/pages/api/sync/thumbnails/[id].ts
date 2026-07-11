import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { fileThumbnails } from '../../../../db/schema';
import { db } from '../../../../db';
import { requireSyncAuth } from '../../../../lib/api-helpers';
import { getThumbnailByKey } from '../../../../lib/file-pipeline';

export const GET: APIRoute = async (context) => {
  const auth = await requireSyncAuth(context, 'sync:read');
  if (auth instanceof Response) return auth;
  const thumbnail = await db.query.fileThumbnails.findFirst({ where: eq(fileThumbnails.id, context.params.id ?? '') });
  if (!thumbnail) return new Response('Not found', { status: 404 });
  const product = await db.query.products.findFirst({
    where: (table, operators) => operators.and(operators.eq(table.ownerUserId, auth.user.id), operators.eq(table.thumbnailFileThumbnailId, thumbnail.id)),
    columns: { id: true },
  });
  if (!product) return new Response('Not found', { status: 404 });
  const data = await getThumbnailByKey(thumbnail.storageKey);
  if (!data) return new Response('Thumbnail unavailable', { status: 404 });
  return new Response(new Uint8Array(data), { headers: { 'Content-Type': thumbnail.mimeType, 'Cache-Control': 'private, max-age=3600' } });
};

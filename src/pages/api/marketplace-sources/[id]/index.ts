import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { marketplaceSources } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { json, jsonError, requireAuth } from '../../../../lib/api-helpers';

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  const id = context.params.id;

  if (!id) return jsonError('Marketplace ID required', 400);

  const marketplace = await db.query.marketplaceSources.findFirst({
    where: eq(marketplaceSources.id, id),
  });

  if (!marketplace) return jsonError('Marketplace not found', 404);
  if (!marketplace.isUserDefined) return jsonError('Cannot delete platform marketplace', 403);
  if (marketplace.ownerUserId !== auth.user.id) return jsonError('Cannot delete marketplace owned by another user', 403);

  await db.delete(marketplaceSources).where(eq(marketplaceSources.id, id));

  return json({ success: true });
};

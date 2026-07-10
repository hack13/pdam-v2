import type { APIRoute } from 'astro';
import { requireSyncAuth, json, jsonError } from '../../../lib/api-helpers';
import { db } from '../../../db';
import { syncItems } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';

export const POST: APIRoute = async (context) => {
  const auth = await requireSyncAuth(context, 'sync:read');
  if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({})) as { itemId?: string };
  if (!body.itemId) return jsonError('itemId is required');
  await db.update(syncItems).set({ status: 'completed' }).where(and(eq(syncItems.id, body.itemId), eq(syncItems.userId, auth.user.id)));
  return json({ success: true });
};

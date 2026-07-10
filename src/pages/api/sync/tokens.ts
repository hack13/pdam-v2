import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../../db';
import { syncTokens } from '../../../db/schema';
import { requireAuth, json, jsonError } from '../../../lib/api-helpers';
import { createSyncToken, revokeSyncToken } from '../../../lib/sync-tokens';

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const rows = await db.query.syncTokens.findMany({ where: eq(syncTokens.userId, auth.user.id), orderBy: [desc(syncTokens.createdAt)] });
  return json({ tokens: rows.map(({ tokenHash: _, ...row }) => row) });
};
export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({})) as { name?: string; expiresInDays?: number };
  if (!body.name?.trim()) return jsonError('Token name is required');
  const expiresAt = body.expiresInDays && body.expiresInDays > 0 ? new Date(Date.now() + body.expiresInDays * 86400000) : null;
  const result = await createSyncToken({ userId: auth.user.id, name: body.name.trim(), expiresAt });
  return json({ token: result.token, tokenRecord: result.row }, 201);
};
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = new URL(context.request.url).searchParams.get('id');
  if (!id) return jsonError('Token ID required');
  await revokeSyncToken(auth.user.id, id);
  return json({ success: true });
};

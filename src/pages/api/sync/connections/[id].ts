import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { syncRuns, userStorageConnections } from '../../../../db/schema';
import { requireAuth, json, jsonError } from '../../../../lib/api-helpers';
import { enqueueConnectionSync } from '../../../../lib/sync-queue';

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = context.params.id; if (!id) return jsonError('Connection ID required');
  try {
    return json(await enqueueConnectionSync(id, auth.user.id), 202);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Sync failed', 500);
  }
};
export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = context.params.id; if (!id) return jsonError('Connection ID required');
  const rows = await db.query.syncRuns.findMany({ where: and(eq(syncRuns.connectionId, id), eq(syncRuns.userId, auth.user.id)), orderBy: [desc(syncRuns.createdAt)], limit: 20 });
  return json({ runs: rows });
};
export const PUT: APIRoute = async (context) => {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = context.params.id; if (!id) return jsonError('Connection ID required');
  const body = await context.request.json().catch(() => ({})) as { scheduleEnabled?: boolean; scheduleFrequency?: string | null; scheduleDayOfWeek?: number | null; scheduleTime?: string | null; scheduleTimezone?: string };
  if (body.scheduleEnabled && !['daily', 'weekly'].includes(body.scheduleFrequency ?? '')) return jsonError('Schedule frequency must be daily or weekly');
  if (body.scheduleEnabled && (!/^\d{2}:\d{2}$/.test(body.scheduleTime ?? '') || Number(body.scheduleTime?.slice(0, 2)) > 23 || Number(body.scheduleTime?.slice(3, 5)) > 59)) return jsonError('Schedule time must use HH:MM');
  if (body.scheduleFrequency === 'weekly' && (body.scheduleDayOfWeek == null || body.scheduleDayOfWeek < 0 || body.scheduleDayOfWeek > 6)) return jsonError('A weekday is required for weekly schedules');
  try { new Intl.DateTimeFormat('en-US', { timeZone: body.scheduleTimezone || 'UTC' }); } catch { return jsonError('Schedule timezone is invalid'); }
  const [connection] = await db.update(userStorageConnections).set({
    scheduleEnabled: body.scheduleEnabled ?? false,
    scheduleFrequency: body.scheduleEnabled ? body.scheduleFrequency ?? null : null,
    scheduleDayOfWeek: body.scheduleEnabled && body.scheduleFrequency === 'weekly' ? body.scheduleDayOfWeek ?? null : null,
    scheduleTime: body.scheduleEnabled ? body.scheduleTime ?? null : null,
    scheduleTimezone: body.scheduleTimezone || 'UTC',
    updatedAt: new Date(),
  }).where(and(eq(userStorageConnections.id, id), eq(userStorageConnections.userId, auth.user.id))).returning();
  if (!connection) return jsonError('Connection not found', 404);
  return json({ connection });
};
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = context.params.id; if (!id) return jsonError('Connection ID required');
  await db.delete(userStorageConnections).where(and(eq(userStorageConnections.id, id), eq(userStorageConnections.userId, auth.user.id)));
  return json({ success: true });
};

import type { APIRoute } from 'astro';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '../../../../db';
import { syncRunFailures, syncRuns } from '../../../../db/schema';
import { requireAuth, json, jsonError } from '../../../../lib/api-helpers';
import { cancelQueuedSync, getSyncJobState } from '../../../../lib/sync-queue';

let failuresTableUnavailable = false;

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  const runId = context.params.id;
  if (!runId) return jsonError('Run ID required');
  const run = await db.query.syncRuns.findFirst({ where: and(eq(syncRuns.id, runId), eq(syncRuns.userId, auth.user.id)) });
  if (!run) return jsonError('Sync run not found', 404);
  if (['completed', 'failed', 'partial', 'cancelled'].includes(run.status)) return jsonError('Sync run is no longer running', 409);
  const now = new Date();
  const wasQueued = ['queued', 'retrying'].includes(run.status);
  await db.update(syncRuns).set({ cancelRequestedAt: now, status: wasQueued ? 'cancelled' : 'cancellation_requested', completedAt: wasQueued ? now : undefined }).where(and(eq(syncRuns.id, runId), eq(syncRuns.userId, auth.user.id), isNull(syncRuns.cancelRequestedAt), ne(syncRuns.status, 'cancelled')));
  await cancelQueuedSync({ ...run, cancelRequestedAt: new Date(), status: 'cancellation_requested' });
  return json({ success: true, status: 'cancellation_requested' });
};

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  const runId = context.params.id;
  if (!runId) return jsonError('Run ID required');
  const run = await db.query.syncRuns.findFirst({ where: and(eq(syncRuns.id, runId), eq(syncRuns.userId, auth.user.id)) });
  if (!run) return jsonError('Sync run not found', 404);
  let failures: typeof syncRunFailures.$inferSelect[] = [];
  if (!failuresTableUnavailable) {
    try {
      failures = await db.query.syncRunFailures.findMany({
        where: and(eq(syncRunFailures.runId, run.id), eq(syncRunFailures.userId, auth.user.id)),
        orderBy: [desc(syncRunFailures.lastFailedAt)],
      });
    } catch (error) {
      const details = error as { cause?: { code?: string }; message?: string };
      if (details.cause?.code !== '42P01' && !details.message?.includes('sync_run_failures')) throw error;
      failuresTableUnavailable = true;
      console.warn('[sync-runs] sync_run_failures is unavailable; run migration 0018_sync_run_failures');
    }
  }
  return json({ run, job: await getSyncJobState(run), failures, diagnosticsAvailable: !failuresTableUnavailable });
};

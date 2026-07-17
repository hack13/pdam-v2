import { PgBoss } from 'pg-boss';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { pendingUploads, syncRuns, userStorageConnections } from '../db/schema';
import { notifySyncRunChanged } from './sync-events';

export const SYNC_QUEUE = 'pdam-sync-destination';
export const SYNC_SCHEDULER_QUEUE = 'pdam-sync-scheduler';
export const UPLOAD_PROMOTION_QUEUE = 'pdam-upload-promotion';
export type SyncJobData = { runId: string; connectionId: string; userId: string };
export type UploadPromotionJobData = { sessionId: string };

let bossPromise: Promise<PgBoss> | null = null;

export async function getSyncBoss() {
  if (!bossPromise) {
    const runtimeEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const connectionString = process.env.DATABASE_URL ?? runtimeEnv?.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required for pg-boss');
    const boss = new PgBoss({ connectionString, schema: 'pgboss', useListenNotify: true });
    boss.on('error', (error) => console.error('[pgboss] error', error));
    boss.on('warning', (warning) => console.warn('[pgboss] warning', warning));
    bossPromise = boss.start().then(async () => {
      // pg-boss requires expiration to be strictly less than 24 hours.
      // Resumable Nextcloud state lets a retry continue after expiration.
      await boss.createQueue(SYNC_QUEUE, { notify: true, retryLimit: 5, retryDelay: 30, retryBackoff: true, retryDelayMax: 43_200, heartbeatSeconds: 60, expireInSeconds: 23 * 3600 + 59 * 60, deleteAfterSeconds: 30 * 86400 });
      await boss.createQueue(SYNC_SCHEDULER_QUEUE, { notify: true, retryLimit: 3, retryDelay: 30, retryBackoff: true, retryDelayMax: 300, heartbeatSeconds: 60, expireInSeconds: 300, deleteAfterSeconds: 7 * 86400 });
      await boss.createQueue(UPLOAD_PROMOTION_QUEUE, { notify: true, retryLimit: 5, retryDelay: 15, retryBackoff: true, retryDelayMax: 900, heartbeatSeconds: 60, expireInSeconds: 3600, deleteAfterSeconds: 30 * 86400 });
      await boss.schedule(SYNC_SCHEDULER_QUEUE, '* * * * *', { type: 'due-syncs' }, {
        key: 'due-connections',
        tz: 'UTC',
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
        expireInSeconds: 300,
        group: { id: 'pdam-sync-scheduler' },
      });
      return boss;
    });
  }
  return bossPromise;
}

/** Queue a verified staged object for durable promotion into content-addressed storage. */
export async function enqueueUploadPromotion(sessionId: string) {
  const session = await db.query.pendingUploads.findFirst({ where: eq(pendingUploads.id, sessionId) });
  if (!session) throw new Error('Upload session not found');
  if (session.promotionJobId) return session.promotionJobId;

  const boss = await getSyncBoss();
  const jobId = await boss.send(UPLOAD_PROMOTION_QUEUE, { sessionId } satisfies UploadPromotionJobData, {
    retryLimit: 5,
    retryDelay: 15,
    retryBackoff: true,
    retryDelayMax: 900,
    heartbeatSeconds: 60,
    expireInSeconds: 3600,
    group: { id: session.userId },
  });
  if (!jobId) throw new Error('Upload promotion job was not queued');
  await db.update(pendingUploads).set({ promotionJobId: jobId }).where(eq(pendingUploads.id, sessionId));
  return jobId;
}

export async function enqueueConnectionSync(connectionId: string, userId: string) {
  const connection = await db.query.userStorageConnections.findFirst({ where: and(eq(userStorageConnections.id, connectionId), eq(userStorageConnections.userId, userId), eq(userStorageConnections.enabled, true)) });
  if (!connection) throw new Error('Sync destination not found or disabled');
  const existing = await db.query.syncRuns.findFirst({ where: and(eq(syncRuns.connectionId, connectionId), inArray(syncRuns.status, ['queued', 'running', 'retrying', 'cancellation_requested'])) });
  if (existing?.pgBossJobId) return { runId: existing.id, jobId: existing.pgBossJobId, status: existing.status, alreadyQueued: true };
  if (existing) {
    await db.update(syncRuns).set({ status: 'cancelled', completedAt: new Date(), errorSummary: 'Replaced by pg-boss queue' }).where(eq(syncRuns.id, existing.id));
  }
  const run = (await db.insert(syncRuns).values({ connectionId, userId, status: 'queued', pgBossQueue: SYNC_QUEUE }).returning())[0];
  const boss = await getSyncBoss();
  const jobId = await boss.send(SYNC_QUEUE, { runId: run.id, connectionId, userId } satisfies SyncJobData, { retryLimit: 5, retryDelay: 30, retryBackoff: true, retryDelayMax: 43_200, heartbeatSeconds: 60, expireInSeconds: 23 * 3600 + 59 * 60, group: { id: userId } });
  if (!jobId) throw new Error('Sync job was not queued');
  await db.update(syncRuns).set({ pgBossJobId: jobId }).where(eq(syncRuns.id, run.id));
  await notifySyncRunChanged(run.id);
  return { runId: run.id, jobId, status: 'queued', alreadyQueued: false };
}

export async function enqueueEnabledConnections(limit = 100) {
  const connections = await db.query.userStorageConnections.findMany({ where: eq(userStorageConnections.enabled, true), limit });
  const results = [];
  for (const connection of connections) {
    try { results.push(await enqueueConnectionSync(connection.id, connection.userId)); }
    catch (error) { results.push({ connectionId: connection.id, status: 'failed', error: error instanceof Error ? error.message : 'Could not queue sync' }); }
  }
  return results;
}

export async function cancelQueuedSync(run: typeof syncRuns.$inferSelect) {
  if (!run.pgBossJobId || !run.pgBossQueue) return false;
  const boss = await getSyncBoss();
  await boss.cancel(run.pgBossQueue, run.pgBossJobId);
  return true;
}

export async function getSyncJobState(run: typeof syncRuns.$inferSelect) {
  if (!run.pgBossJobId || !run.pgBossQueue) return null;
  const boss = await getSyncBoss();
  const [job] = await boss.findJobs(run.pgBossQueue, { id: run.pgBossJobId });
  if (!job) return null;
  return {
    id: job.id,
    state: job.state,
    retryCount: 'retryCount' in job ? job.retryCount : null,
    retryLimit: 'retryLimit' in job ? job.retryLimit : null,
    startedOn: 'startedOn' in job ? job.startedOn : null,
    completedOn: 'completedOn' in job ? job.completedOn : null,
  };
}

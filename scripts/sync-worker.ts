import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { getSyncBoss, SYNC_QUEUE, SYNC_SCHEDULER_QUEUE, UPLOAD_PROMOTION_QUEUE, type SyncJobData, type UploadPromotionJobData } from '../src/lib/sync-queue';
import { db } from '../src/db';
import { syncRuns } from '../src/db/schema';
import { runSync } from '../src/lib/sync-service';
import { enqueueDueScheduledConnections } from '../src/lib/sync-scheduler';
import { notifySyncRunChanged } from '../src/lib/sync-events';
import { promotePendingUpload } from '../src/lib/upload-promotion-service';
import { pendingUploads } from '../src/db/schema';

const boss = await getSyncBoss();
const syncConcurrency = Math.max(1, Number(process.env.SYNC_WORKER_CONCURRENCY ?? 1));
const uploadPromotionConcurrency = Math.max(1, Number(process.env.UPLOAD_PROMOTION_CONCURRENCY ?? 2));
console.info('[sync-worker] started', { queues: [SYNC_QUEUE, SYNC_SCHEDULER_QUEUE, UPLOAD_PROMOTION_QUEUE], syncConcurrency, uploadPromotionConcurrency });

await boss.work(UPLOAD_PROMOTION_QUEUE, { includeMetadata: true, localConcurrency: uploadPromotionConcurrency, groupConcurrency: 1, pollingIntervalSeconds: 2 }, async ([job]) => {
  const data = job.data as UploadPromotionJobData;
  try {
    return await promotePendingUpload(data.sessionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload promotion failed';
    const exhausted = job.retryCount >= job.retryLimit;
    await db.update(pendingUploads)
      .set({ status: exhausted ? 'failed' : 'retrying', errorSummary: message })
      .where(eq(pendingUploads.id, data.sessionId));
    throw error;
  }
});

await boss.work(SYNC_SCHEDULER_QUEUE, { includeMetadata: true, localConcurrency: 1, groupConcurrency: 1, pollingIntervalSeconds: 2 }, async ([job]) => {
  const results = await enqueueDueScheduledConnections(new Date(), 500);
  const failed = results.filter((result) => result.status === 'failed').length;
  console.info('[sync-worker] scheduler tick completed', { jobId: job.id, queued: results.length - failed, failed });
  return { queued: results.length - failed, failed };
});

await boss.work(SYNC_QUEUE, { includeMetadata: true, localConcurrency: syncConcurrency, groupConcurrency: 1, pollingIntervalSeconds: 2 }, async ([job]) => {
  const data = job.data as SyncJobData;
  console.info('[sync-worker] job started', { jobId: job.id, runId: data.runId, connectionId: data.connectionId, retryCount: job.retryCount });
  await db.update(syncRuns).set({ status: 'running', startedAt: new Date() }).where(eq(syncRuns.id, data.runId));
  await notifySyncRunChanged(data.runId);
  try {
    const result = await runSync(data.connectionId, { userId: data.userId, runId: data.runId, signal: job.signal });
    if (result.status === 'cancelled') return result;
    if (result.filesFailed > 0) {
      await db.update(syncRuns).set({ status: 'retrying', errorSummary: `${result.filesFailed} file(s) failed; pg-boss will retry this job` }).where(eq(syncRuns.id, data.runId));
      throw new Error(`${result.filesFailed} file(s) failed`);
    }
    console.info('[sync-worker] job completed', { jobId: job.id, runId: data.runId, status: result.status });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync job failed';
    const exhausted = job.retryCount >= job.retryLimit;
    await db.update(syncRuns).set({ status: exhausted ? 'failed' : 'retrying', completedAt: exhausted ? new Date() : undefined, errorSummary: message }).where(eq(syncRuns.id, data.runId));
    console.error('[sync-worker] job failed', { jobId: job.id, runId: data.runId, retryCount: job.retryCount, retryLimit: job.retryLimit, exhausted, error: message });
    throw error;
  }
});

const shutdown = async (signal: string) => { console.info('[sync-worker] stopping', { signal }); await boss.stop({ graceful: true }); process.exit(0); };
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
await new Promise(() => {});

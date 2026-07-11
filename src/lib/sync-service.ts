import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { syncItems, syncRuns, userAssetFiles, userStorageConnections } from '../db/schema';
import { getFileByBlobId } from './file-pipeline';
import { buildSyncManifest } from './sync-manifest';
import { createSyncDestination } from './sync-destinations';
import { notifySyncRunChanged } from './sync-events';

const activeSyncs = new Map<string, AbortController>();

class SyncCancelledError extends Error {
  constructor() { super('Sync cancelled by user'); }
}

export function cancelActiveSync(runId: string) {
  activeSyncs.get(runId)?.abort();
}

async function updateRunProgress(runId: string, progress: {
  filesDiscovered: number;
  filesUploaded: number;
  filesSkipped: number;
  filesFailed: number;
  bytesUploaded: number;
}) {
  await db.update(syncRuns).set(progress).where(eq(syncRuns.id, runId));
  await notifySyncRunChanged(runId);
}

async function cancellationRequested(runId: string) {
  const run = await db.query.syncRuns.findFirst({ where: eq(syncRuns.id, runId), columns: { cancelRequestedAt: true } });
  return Boolean(run?.cancelRequestedAt);
}

function safeFileName(fileName: string) {
  return fileName.replace(/[\\/]/g, '_').replace(/^\.+$/, '_');
}

export async function runSync(connectionId: string, options?: { userId?: string; cursor?: string; signal?: AbortSignal; runId?: string }) {
  const connection = await db.query.userStorageConnections.findFirst({ where: eq(userStorageConnections.id, connectionId) });
  if (!connection || !connection.enabled || (options?.userId && connection.userId !== options.userId)) throw new Error('Sync destination not found or disabled');
  console.info('[sync] starting run', { connectionId, userId: connection.userId, providerType: connection.providerType });
  const run = options?.runId
    ? (await db.query.syncRuns.findFirst({ where: and(eq(syncRuns.id, options.runId), eq(syncRuns.connectionId, connectionId)) }) ?? null)
    : (await db.insert(syncRuns).values({ connectionId, userId: connection.userId, status: 'running', startedAt: new Date() }).returning())[0];
  if (!run) throw new Error('Sync run not found');
  const controller = new AbortController();
  activeSyncs.set(run.id, controller);
  await db.update(userStorageConnections).set({ lastAttemptedSyncAt: new Date(), updatedAt: new Date() }).where(eq(userStorageConnections.id, connectionId));
  try {
    const destination = await createSyncDestination(connection);
    await destination.testConnection();
    const manifest = await buildSyncManifest(connection.userId, options?.cursor ?? null);
    const files = manifest.assets.flatMap((asset) => asset.versions.flatMap((version) => version.files.map((file) => ({ ...file, path: `assets/${asset.slug}/versions/${version.version}/files/${safeFileName(file.fileName)}` }))));
    await db.update(syncRuns).set({ filesDiscovered: files.length, manifestId: manifest.generatedAt, cursor: manifest.nextCursor }).where(eq(syncRuns.id, run.id));
    await notifySyncRunChanged(run.id);
    console.info('[sync] manifest ready', { runId: run.id, connectionId, files: files.length });
    let uploaded = 0, skipped = 0, failed = 0, bytes = 0;
    for (const file of files) {
      if (options?.signal?.aborted || controller.signal.aborted || await cancellationRequested(run.id)) throw new SyncCancelledError();
      const existing = await db.query.syncItems.findFirst({ where: and(eq(syncItems.connectionId, connectionId), eq(syncItems.blobId, file.blobId), eq(syncItems.contentHash, file.sha256), eq(syncItems.destinationKey, file.path), eq(syncItems.status, 'completed')) });
      if (existing) {
        skipped++;
        await updateRunProgress(run.id, { filesDiscovered: files.length, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes });
        continue;
      }
      const prior = await db.query.syncItems.findFirst({ where: and(eq(syncItems.connectionId, connectionId), eq(syncItems.blobId, file.blobId), eq(syncItems.contentHash, file.sha256)) });
      const item = prior
        ? (await db.update(syncItems).set({ runId: run.id, destinationKey: file.path, status: 'pending', lastError: null, retryCount: prior.retryCount + 1 }).where(eq(syncItems.id, prior.id)).returning())[0]
        : (await db.insert(syncItems).values({ runId: run.id, connectionId, userId: connection.userId, blobId: file.blobId, destinationKey: file.path, contentHash: file.sha256, byteSize: file.byteSize }).returning())[0];
      try {
        const data = await getFileByBlobId(file.blobId);
        if (!data) throw new Error('Source file is unavailable');
        const result = await destination.putObject({ destinationKey: file.path, body: data.data, contentType: file.mimeType, sha256: file.sha256, signal: options?.signal ?? controller.signal });
        await db.update(syncItems).set({ status: 'completed', remoteId: result.remoteId ?? null, etag: result.etag ?? null }).where(eq(syncItems.id, item.id));
        await db.update(userAssetFiles).set({ isBackedUp: true }).where(and(eq(userAssetFiles.userId, connection.userId), eq(userAssetFiles.blobId, file.blobId)));
        uploaded++; bytes += file.byteSize;
        await updateRunProgress(run.id, { filesDiscovered: files.length, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes });
      } catch (error) {
        if (options?.signal?.aborted || controller.signal.aborted || await cancellationRequested(run.id)) throw new SyncCancelledError();
        failed++;
        const message = error instanceof Error ? error.message : 'Upload failed';
        console.error('[sync] file failed', { runId: run.id, connectionId, blobId: file.blobId, destinationKey: file.path, error: message });
        await db.update(syncItems).set({ status: 'failed', retryCount: item.retryCount, lastError: message }).where(eq(syncItems.id, item.id));
        await updateRunProgress(run.id, { filesDiscovered: files.length, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes });
      }
    }
    const manifestKey = `manifest/v1/${manifest.generatedAt.replace(/[^0-9]/g, '')}.json`;
    if (failed === 0) await destination.putObject({ destinationKey: manifestKey, body: Buffer.from(JSON.stringify(manifest, null, 2)), contentType: 'application/json', sha256: manifest.generatedAt });
    const status = failed ? (uploaded || skipped ? 'partial' : 'failed') : 'completed';
    await db.update(syncRuns).set({ status, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes, completedAt: new Date(), errorSummary: failed ? `${failed} file(s) failed` : null }).where(eq(syncRuns.id, run.id));
    await notifySyncRunChanged(run.id);
    await db.update(userStorageConnections).set({ lastSuccessfulSyncAt: failed ? connection.lastSuccessfulSyncAt : new Date(), lastError: failed ? `${failed} file(s) failed` : null, errorCount: failed ? connection.errorCount + 1 : 0, updatedAt: new Date() }).where(eq(userStorageConnections.id, connectionId));
    console.info('[sync] run finished', { runId: run.id, connectionId, status, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes });
    return { runId: run.id, status, filesDiscovered: files.length, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes, nextCursor: manifest.nextCursor };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    if (error instanceof SyncCancelledError || options?.signal?.aborted || controller.signal.aborted || await cancellationRequested(run.id)) {
      console.info('[sync] run cancelled', { runId: run.id, connectionId });
      await db.update(syncRuns).set({ status: 'cancelled', completedAt: new Date(), errorSummary: 'Cancelled by user' }).where(eq(syncRuns.id, run.id));
      await notifySyncRunChanged(run.id);
      return { runId: run.id, status: 'cancelled', filesDiscovered: 0, filesUploaded: 0, filesSkipped: 0, filesFailed: 0, bytesUploaded: 0, nextCursor: null };
    }
    console.error('[sync] run failed', { runId: run.id, connectionId, providerType: connection.providerType, error: message, stack: error instanceof Error ? error.stack : undefined });
    await db.update(syncRuns).set({ status: 'failed', completedAt: new Date(), errorSummary: message }).where(eq(syncRuns.id, run.id));
    await notifySyncRunChanged(run.id);
    await db.update(userStorageConnections).set({ lastError: message, errorCount: connection.errorCount + 1, updatedAt: new Date() }).where(eq(userStorageConnections.id, connectionId));
    throw error;
  } finally {
    activeSyncs.delete(run.id);
  }
}

import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '../db';
import { syncItems, syncRuns, userAssetFiles, userStorageConnections } from '../db/schema';
import { getFileSourceByBlobId, getThumbnailByKey } from './file-pipeline';
import { buildSyncManifest } from './sync-manifest';
import { createSyncDestination, SyncDestinationError } from './sync-destinations';
import { recordSyncFailure, resolveSyncFailure } from './sync-diagnostics';
import { notifySyncRunChanged } from './sync-events';
import { buildArchiveHtml } from './archive-html';

const activeSyncs = new Map<string, AbortController>();

class SyncCancelledError extends Error { constructor() { super('Sync cancelled by user'); } }

export function cancelActiveSync(runId: string) { activeSyncs.get(runId)?.abort(); }

async function updateRunProgress(runId: string, progress: { filesDiscovered: number; filesUploaded: number; filesSkipped: number; filesFailed: number; bytesUploaded: number }) {
  await db.update(syncRuns).set(progress).where(eq(syncRuns.id, runId));
  await notifySyncRunChanged(runId);
}

async function cancellationRequested(runId: string) {
  const run = await db.query.syncRuns.findFirst({ where: eq(syncRuns.id, runId), columns: { cancelRequestedAt: true } });
  return Boolean(run?.cancelRequestedAt);
}

function diagnostics(error: unknown, providerType: string) {
  if (error instanceof SyncDestinationError) {
    return { code: error.code, details: { providerType, httpStatus: error.httpStatus ?? null, retryable: error.retryable } };
  }
  return { code: 'DESTINATION_PROTOCOL', details: { providerType, httpStatus: null, retryable: false } };
}

function hash(data: Buffer | string) { return createHash('sha256').update(data).digest('hex'); }

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
    const files = manifest.assets.flatMap((asset) => asset.versions.flatMap((version) => version.files));
    await db.update(syncRuns).set({ filesDiscovered: files.length, manifestId: manifest.generatedAt, cursor: manifest.nextCursor, failureCode: null, failureDetails: null }).where(eq(syncRuns.id, run.id));
    await notifySyncRunChanged(run.id);
    console.info('[sync] manifest ready', { runId: run.id, connectionId, files: files.length });

    let uploaded = 0, skipped = 0, failed = 0, bytes = 0;
    const failureState: { latest: ReturnType<typeof diagnostics> | null } = { latest: null };
    const trackFailure = async (input: { itemKind: 'file' | 'thumbnail' | 'metadata'; itemName: string; destinationKey: string; error: unknown }) => {
      const diagnostic = diagnostics(input.error, connection.providerType);
      failureState.latest = diagnostic;
      await recordSyncFailure({
        runId: run.id,
        userId: connection.userId,
        itemKind: input.itemKind,
        itemName: input.itemName,
        destinationKey: input.destinationKey,
        errorMessage: input.error instanceof Error ? input.error.message : 'Upload failed',
        failureCode: diagnostic.code,
        httpStatus: diagnostic.details.httpStatus,
        retryable: diagnostic.details.retryable,
      });
      return diagnostic;
    };
    for (const file of files) {
      if (options?.signal?.aborted || controller.signal.aborted || await cancellationRequested(run.id)) throw new SyncCancelledError();
      const destinationKey = file.path;
      const completed = await db.query.syncItems.findFirst({
        where: and(eq(syncItems.connectionId, connectionId), eq(syncItems.blobId, file.blobId), eq(syncItems.contentHash, file.sha256), eq(syncItems.destinationKey, destinationKey), eq(syncItems.status, 'completed')),
      });
      if (completed && await destination.exists(destinationKey)) {
        skipped++;
        await resolveSyncFailure(run.id, destinationKey);
        await updateRunProgress(run.id, { filesDiscovered: files.length, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes });
        continue;
      }

      const prior = await db.query.syncItems.findFirst({ where: and(eq(syncItems.connectionId, connectionId), eq(syncItems.blobId, file.blobId), eq(syncItems.contentHash, file.sha256)) });
      const item = prior
        ? (await db.update(syncItems).set({ runId: run.id, destinationKey, status: 'pending', lastError: null, retryCount: prior.retryCount + 1, lastAttemptedAt: new Date() }).where(eq(syncItems.id, prior.id)).returning())[0]
        : (await db.insert(syncItems).values({ runId: run.id, connectionId, userId: connection.userId, blobId: file.blobId, destinationKey, contentHash: file.sha256, byteSize: file.byteSize, lastAttemptedAt: new Date() }).returning())[0];

      try {
        const source = await getFileSourceByBlobId(file.blobId);
        if (!source) throw new SyncDestinationError('Source file is unavailable', 'SOURCE_UNAVAILABLE');
        const result = await destination.putObject({
          destinationKey,
          source,
          contentType: file.mimeType,
          sha256: file.sha256,
          signal: options?.signal ?? controller.signal,
          resume: {
            transferSessionId: item.transferSessionId,
            onProgress: async (progress) => {
              await db.update(syncItems).set({ transferSessionId: progress.transferSessionId, bytesTransferred: progress.bytesTransferred, lastHttpStatus: progress.httpStatus ?? null, lastAttemptedAt: new Date() }).where(eq(syncItems.id, item.id));
            },
          },
        });
        await db.update(syncItems).set({ status: 'completed', remoteId: result.remoteId ?? null, etag: result.etag ?? null, transferSessionId: null, bytesTransferred: file.byteSize, lastHttpStatus: null }).where(eq(syncItems.id, item.id));
        await db.update(userAssetFiles).set({ isBackedUp: true }).where(and(eq(userAssetFiles.userId, connection.userId), eq(userAssetFiles.blobId, file.blobId)));
        await resolveSyncFailure(run.id, destinationKey);
        uploaded++; bytes += file.byteSize;
        await updateRunProgress(run.id, { filesDiscovered: files.length, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes });
      } catch (error) {
        if (options?.signal?.aborted || controller.signal.aborted || await cancellationRequested(run.id)) throw new SyncCancelledError();
        failed++;
        const message = error instanceof Error ? error.message : 'Upload failed';
        const failure = await trackFailure({ itemKind: 'file', itemName: file.fileName, destinationKey, error });
        console.error('[sync] file failed', { runId: run.id, connectionId, blobId: file.blobId, providerType: connection.providerType, failureCode: failure.code, httpStatus: failure.details.httpStatus, error: message });
        await db.update(syncItems).set({ status: 'failed', retryCount: item.retryCount, lastError: message, lastHttpStatus: failure.details.httpStatus, lastAttemptedAt: new Date() }).where(eq(syncItems.id, item.id));
        await updateRunProgress(run.id, { filesDiscovered: files.length, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes });
      }
    }

    for (const asset of manifest.assets) {
      if (!asset.thumbnail) continue;
      if (options?.signal?.aborted || controller.signal.aborted || await cancellationRequested(run.id)) throw new SyncCancelledError();
      const thumbnailData = await getThumbnailByKey(asset.thumbnail.storageKey);
      const destinationKey = asset.thumbnailPath!;
      if (!thumbnailData) {
        failed++;
        const error = new SyncDestinationError('Source thumbnail is unavailable', 'SOURCE_UNAVAILABLE');
        const failure = await trackFailure({ itemKind: 'thumbnail', itemName: `${asset.title} thumbnail`, destinationKey, error });
        console.error('[sync] thumbnail unavailable', { runId: run.id, assetId: asset.id, failureCode: failure.code });
        await updateRunProgress(run.id, { filesDiscovered: files.length, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes });
        continue;
      }
      try {
        await destination.putObject({ destinationKey, body: thumbnailData, contentType: asset.thumbnail.mimeType, sha256: hash(thumbnailData), signal: options?.signal ?? controller.signal });
        await resolveSyncFailure(run.id, destinationKey);
      } catch (error) {
        failed++;
        const failure = await trackFailure({ itemKind: 'thumbnail', itemName: `${asset.title} thumbnail`, destinationKey, error });
        console.error('[sync] thumbnail failed', { runId: run.id, assetId: asset.id, providerType: connection.providerType, failureCode: failure.code, error: error instanceof Error ? error.message : 'Upload failed' });
        await updateRunProgress(run.id, { filesDiscovered: files.length, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes });
      }
    }

    // Archive.html remains useful even for a partial backup; manifests only
    // advance after every immutable object is available.
    const archiveBody = Buffer.from(buildArchiveHtml(manifest));
    try {
      await destination.putObject({ destinationKey: 'Archive.html', body: archiveBody, contentType: 'text/html; charset=utf-8', sha256: hash(archiveBody), signal: options?.signal ?? controller.signal, overwrite: true });
      await resolveSyncFailure(run.id, 'Archive.html');
    } catch (error) {
      failed++;
      const failure = await trackFailure({ itemKind: 'metadata', itemName: 'Archive.html', destinationKey: 'Archive.html', error });
      console.error('[sync] archive failed', { runId: run.id, connectionId, providerType: connection.providerType, failureCode: failure.code, error: error instanceof Error ? error.message : 'Upload failed' });
      await updateRunProgress(run.id, { filesDiscovered: files.length, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes });
    }

    if (failed === 0) {
      const manifestBody = Buffer.from(JSON.stringify(manifest, null, 2));
      const manifestHash = hash(manifestBody);
      const manifestKey = `manifest/v1/${manifest.generatedAt.replace(/[^0-9]/g, '')}.json`;
      let metadataKey = manifestKey;
      try {
        await destination.putObject({ destinationKey: manifestKey, body: manifestBody, contentType: 'application/json', sha256: manifestHash, signal: options?.signal ?? controller.signal });
        await resolveSyncFailure(run.id, manifestKey);
        metadataKey = 'latest-manifest.json';
        await destination.putObject({ destinationKey: 'latest-manifest.json', body: manifestBody, contentType: 'application/json', sha256: manifestHash, signal: options?.signal ?? controller.signal, overwrite: true });
        await resolveSyncFailure(run.id, 'latest-manifest.json');
      } catch (error) {
        failed++;
        const failure = await trackFailure({ itemKind: 'metadata', itemName: metadataKey, destinationKey: metadataKey, error });
        console.error('[sync] manifest failed', { runId: run.id, connectionId, providerType: connection.providerType, failureCode: failure.code, error: error instanceof Error ? error.message : 'Upload failed' });
        await updateRunProgress(run.id, { filesDiscovered: files.length, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes });
      }
    }

    const status = failed ? (uploaded || skipped ? 'partial' : 'failed') : 'completed';
    await db.update(syncRuns).set({ status, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes, completedAt: new Date(), errorSummary: failed ? `${failed} file(s) failed` : null, failureCode: failureState.latest?.code ?? null, failureDetails: failureState.latest?.details ?? null }).where(eq(syncRuns.id, run.id));
    await notifySyncRunChanged(run.id);
    await db.update(userStorageConnections).set({ lastSuccessfulSyncAt: failed ? connection.lastSuccessfulSyncAt : new Date(), lastError: failed ? `${failed} file(s) failed` : null, errorCount: failed ? connection.errorCount + 1 : 0, updatedAt: new Date() }).where(eq(userStorageConnections.id, connectionId));
    console.info('[sync] run finished', { runId: run.id, connectionId, status, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes });
    return { runId: run.id, status, filesDiscovered: files.length, filesUploaded: uploaded, filesSkipped: skipped, filesFailed: failed, bytesUploaded: bytes, nextCursor: manifest.nextCursor };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    if (error instanceof SyncCancelledError || options?.signal?.aborted || controller.signal.aborted || await cancellationRequested(run.id)) {
      console.info('[sync] run cancelled', { runId: run.id, connectionId });
      await db.update(syncRuns).set({ status: 'cancelled', completedAt: new Date(), errorSummary: 'Cancelled by user', failureCode: 'CANCELLED', failureDetails: null }).where(eq(syncRuns.id, run.id));
      await notifySyncRunChanged(run.id);
      return { runId: run.id, status: 'cancelled', filesDiscovered: 0, filesUploaded: 0, filesSkipped: 0, filesFailed: 0, bytesUploaded: 0, nextCursor: null };
    }
    const failure = diagnostics(error, connection.providerType);
    await recordSyncFailure({
      runId: run.id,
      userId: connection.userId,
      itemKind: 'metadata',
      itemName: 'Sync run',
      destinationKey: '__sync_run__',
      errorMessage: message,
      failureCode: failure.code,
      httpStatus: failure.details.httpStatus,
      retryable: failure.details.retryable,
    });
    console.error('[sync] run failed', { runId: run.id, connectionId, providerType: connection.providerType, failureCode: failure.code, httpStatus: failure.details.httpStatus, error: message });
    await db.update(syncRuns).set({ status: 'failed', completedAt: new Date(), errorSummary: message, failureCode: failure.code, failureDetails: failure.details }).where(eq(syncRuns.id, run.id));
    await notifySyncRunChanged(run.id);
    await db.update(userStorageConnections).set({ lastError: message, errorCount: connection.errorCount + 1, updatedAt: new Date() }).where(eq(userStorageConnections.id, connectionId));
    throw error;
  } finally { activeSyncs.delete(run.id); }
}

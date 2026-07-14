import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { blobStorageObjects, pendingUploads, userAssetFiles } from '../db/schema';
import { computeShardedBlobKey, finalizeBlobFromStorage, findBlobBySha256, isPendingUploadKey } from './file-pipeline';
import { storage } from './storage';
import { linkBlobToVersion } from './upload-helpers';

/** Promote a verified staging object. Safe to retry after a worker crash. */
export async function promotePendingUpload(sessionId: string) {
  const session = await db.query.pendingUploads.findFirst({ where: eq(pendingUploads.id, sessionId) });
  if (!session) return { status: 'skipped' as const };
  // Uploads completed before this queue existed already have their blob and
  // asset-file records. Promote the object and correct its storage record.
  if (session.status === 'completed') {
    if (!isPendingUploadKey(session.storageKey)) return { status: 'skipped' as const };
    const blob = await findBlobBySha256(session.sha256);
    if (!blob) return { status: 'skipped' as const };
    const destinationKey = computeShardedBlobKey(session.sha256);
    if (!await storage.exists(destinationKey)) await storage.copy(session.storageKey, destinationKey);
    await db.update(blobStorageObjects)
      .set({ storageKey: destinationKey })
      .where(eq(blobStorageObjects.blobId, blob.id));
    await storage.delete(session.storageKey);
    return { status: 'completed' as const, blobId: blob.id };
  }
  if (session.status !== 'queued' && session.status !== 'promoting' && session.status !== 'retrying') {
    throw new Error(`Upload session is ${session.status}, not ready for promotion`);
  }
  if (!isPendingUploadKey(session.storageKey)) throw new Error('Upload session does not reference a staging key');

  await db.update(pendingUploads).set({ status: 'promoting', errorSummary: null }).where(eq(pendingUploads.id, sessionId));

  let blob = await findBlobBySha256(session.sha256);
  let isNew = false;
  if (!blob) {
    const destinationKey = computeShardedBlobKey(session.sha256);
    if (!await storage.exists(destinationKey)) {
      await storage.copy(session.storageKey, destinationKey);
    }
    const result = await finalizeBlobFromStorage(
      session.sha256,
      session.fileName,
      session.mimeType,
      session.fileSize,
      destinationKey,
    );
    blob = result.blob;
    isNew = result.isNew;
  }

  const existingLink = await db.query.userAssetFiles.findFirst({
    where: and(
      eq(userAssetFiles.userId, session.userId),
      eq(userAssetFiles.productVersionId, session.productVersionId),
      eq(userAssetFiles.blobId, blob.id),
    ),
  });
  if (!existingLink) {
    await linkBlobToVersion(session.userId, session.productVersionId, blob, session.fileSize, isNew);
  }

  await storage.delete(session.storageKey);
  await db.update(pendingUploads)
    .set({ status: 'completed', errorSummary: null })
    .where(eq(pendingUploads.id, sessionId));
  return { status: 'completed' as const, blobId: blob.id };
}

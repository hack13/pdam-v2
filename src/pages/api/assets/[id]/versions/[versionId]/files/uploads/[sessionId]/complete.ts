import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../../../../../../db';
import { pendingUploads } from '../../../../../../../../../db/schema';
import { requireAuth, json, jsonError } from '../../../../../../../../../lib/api-helpers';
import {
  isPendingUploadKey,
  verifySha256FromStorage,
} from '../../../../../../../../../lib/file-pipeline';
import { storage } from '../../../../../../../../../lib/storage';
import { computePartCount, getMpuPartSize } from '../../../../../../../../../lib/upload-config';
import { readJsonBody, validateVersionAccess } from '../../../../../../../../../lib/upload-helpers';
import { enqueueUploadPromotion } from '../../../../../../../../../lib/sync-queue';

interface CompleteBody {
  parts?: { partNumber: number; etag: string }[];
}

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  const versionId = context.params.versionId;
  const sessionId = context.params.sessionId;
  if (!productId || !versionId || !sessionId) {
    return jsonError('Asset ID, version ID, and session ID required');
  }

  const access = await validateVersionAccess(auth.user.id, productId, versionId);
  if (access instanceof Response) return access;

  const session = await db.query.pendingUploads.findFirst({
    where: and(
      eq(pendingUploads.id, sessionId),
      eq(pendingUploads.userId, auth.user.id),
      eq(pendingUploads.productVersionId, versionId),
    ),
  });

  if (!session) {
    return jsonError('Upload session not found', 404);
  }

  if (session.status === 'completed' || session.status === 'queued' || session.status === 'promoting' || session.status === 'retrying') {
    return json({ success: true, status: session.status, jobId: session.promotionJobId }, 202);
  }

  if (session.status !== 'pending') {
    return jsonError(`Upload session is ${session.status}`, 409);
  }

  if (session.expiresAt < new Date()) {
    return jsonError('Upload session has expired', 410);
  }

  // Do not complete sessions created before uploads were isolated in staging.
  // Those sessions target a shared content-addressed object and are unsafe.
  if (!isPendingUploadKey(session.storageKey)) {
    if (storage.abortMultipartUpload) {
      await storage.abortMultipartUpload(session.storageKey, session.s3UploadId).catch(() => {});
    }
    await db.update(pendingUploads)
      .set({ status: 'aborted' })
      .where(eq(pendingUploads.id, session.id));
    return jsonError('Upload session must be restarted', 409);
  }

  const body = await readJsonBody<CompleteBody>(context);
  if (body instanceof Response) return body;

  const parts = body.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    return jsonError('parts must be a non-empty array');
  }

  const totalParts = computePartCount(session.fileSize, getMpuPartSize());
  if (parts.length !== totalParts) {
    return jsonError(`Expected ${totalParts} parts, received ${parts.length}`);
  }

  const normalizedParts = parts.map((part) => ({
    partNumber: part.partNumber,
    etag: part.etag.replace(/^"|"$/g, ''),
  }));

  for (const part of normalizedParts) {
    if (!Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > totalParts) {
      return jsonError(`Invalid part number: ${part.partNumber}`);
    }
    if (!part.etag) {
      return jsonError(`Missing etag for part ${part.partNumber}`);
    }
  }

  const partNumbers = new Set(normalizedParts.map((part) => part.partNumber));
  if (partNumbers.size !== totalParts) {
    return jsonError('parts must include every part number exactly once');
  }

  await db.update(pendingUploads)
    .set({ status: 'completing', completedParts: normalizedParts })
    .where(eq(pendingUploads.id, session.id));

  try {
    if (!storage.completeMultipartUpload) {
      return jsonError('Multipart upload is not available', 501);
    }

    await storage.completeMultipartUpload(
      session.storageKey,
      session.s3UploadId,
      normalizedParts,
    );

    const verification = await verifySha256FromStorage(session.storageKey, session.sha256);
    if (!verification.hashValid || verification.byteLength !== session.fileSize) {
      await storage.delete(session.storageKey).catch(() => {});
      await db.update(pendingUploads)
        .set({ status: 'aborted' })
        .where(eq(pendingUploads.id, session.id));
      return jsonError('Uploaded file does not match the declared hash and size', 422);
    }

    await db.update(pendingUploads)
      .set({ status: 'queued', errorSummary: null })
      .where(eq(pendingUploads.id, session.id));
    const jobId = await enqueueUploadPromotion(session.id);
    return json({ success: true, status: 'queued', jobId }, 202);
  } catch (err) {
    await db.update(pendingUploads)
      .set({ status: 'retrying', errorSummary: err instanceof Error ? err.message : 'Failed to queue upload promotion' })
      .where(eq(pendingUploads.id, session.id));

    const message = err instanceof Error ? err.message : 'Failed to complete upload';
    return jsonError(message, 500);
  }
};

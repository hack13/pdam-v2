import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../../../../../../db';
import { pendingUploads } from '../../../../../../../../../db/schema';
import { requireAuth, json, jsonError } from '../../../../../../../../../lib/api-helpers';
import { storage } from '../../../../../../../../../lib/storage';
import { computePartCount, getMpuPartSize } from '../../../../../../../../../lib/upload-config';
import { validateVersionAccess } from '../../../../../../../../../lib/upload-helpers';

async function getSessionForUser(
  sessionId: string,
  userId: string,
  productId: string,
  versionId: string,
  requirePending = true,
) {
  const access = await validateVersionAccess(userId, productId, versionId);
  if (access instanceof Response) return access;

  const session = await db.query.pendingUploads.findFirst({
    where: and(
      eq(pendingUploads.id, sessionId),
      eq(pendingUploads.userId, userId),
      eq(pendingUploads.productVersionId, versionId),
    ),
  });

  if (!session) {
    return jsonError('Upload session not found', 404);
  }

  if (requirePending && session.status !== 'pending') {
    return jsonError(`Upload session is ${session.status}`, 409);
  }

  if (requirePending && session.expiresAt < new Date()) {
    return jsonError('Upload session has expired', 410);
  }

  return session;
}

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  const versionId = context.params.versionId;
  const sessionId = context.params.sessionId;
  if (!productId || !versionId || !sessionId) {
    return jsonError('Asset ID, version ID, and session ID required');
  }

  const session = await getSessionForUser(sessionId, auth.user.id, productId, versionId, false);
  if (session instanceof Response) return session;

  const partSize = getMpuPartSize();
  let completedParts = session.completedParts;

  if (storage.listParts) {
    try {
      const s3Parts = await storage.listParts(session.storageKey, session.s3UploadId);
      const merged = new Map<number, string>();
      for (const part of completedParts) {
        merged.set(part.partNumber, part.etag);
      }
      for (const part of s3Parts) {
        merged.set(part.partNumber, part.etag);
      }
      completedParts = Array.from(merged.entries())
        .map(([partNumber, etag]) => ({ partNumber, etag }))
        .sort((a, b) => a.partNumber - b.partNumber);
    } catch {
      // Fall back to DB-tracked parts when S3 list is unavailable.
    }
  }

  return json({
    sessionId: session.id,
    sha256: session.sha256,
    fileName: session.fileName,
    mimeType: session.mimeType,
    fileSize: session.fileSize,
    partSize,
    totalParts: computePartCount(session.fileSize, partSize),
    completedParts,
    expiresAt: session.expiresAt.toISOString(),
    status: session.status,
    errorSummary: session.errorSummary,
  });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  const versionId = context.params.versionId;
  const sessionId = context.params.sessionId;
  if (!productId || !versionId || !sessionId) {
    return jsonError('Asset ID, version ID, and session ID required');
  }

  const session = await getSessionForUser(sessionId, auth.user.id, productId, versionId);
  if (session instanceof Response) return session;

  if (storage.abortMultipartUpload) {
    try {
      await storage.abortMultipartUpload(session.storageKey, session.s3UploadId);
    } catch {
      // Upload may already be completed or aborted on S3.
    }
  }

  await db.update(pendingUploads)
    .set({ status: 'aborted' })
    .where(eq(pendingUploads.id, session.id));

  return json({ success: true });
};

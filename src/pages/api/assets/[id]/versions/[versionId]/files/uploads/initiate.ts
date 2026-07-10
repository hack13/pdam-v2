import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../../../../../db';
import { pendingUploads } from '../../../../../../../../db/schema';
import { requireAuth, json, jsonError } from '../../../../../../../../lib/api-helpers';
import { computeShardedBlobKey, findBlobBySha256 } from '../../../../../../../../lib/file-pipeline';
import { storage } from '../../../../../../../../lib/storage';
import { linkBlobToVersion, readJsonBody, validateVersionAccess } from '../../../../../../../../lib/upload-helpers';
import {
  computePartCount,
  getMaxUploadBytes,
  getMpuPartSize,
  getMpuSessionTtlHours,
  isValidSha256,
} from '../../../../../../../../lib/upload-config';

interface InitiateBody {
  sha256?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  const versionId = context.params.versionId;
  if (!productId || !versionId) return jsonError('Asset ID and version ID required');

  const access = await validateVersionAccess(auth.user.id, productId, versionId);
  if (access instanceof Response) return access;

  if (!storage.supportsMultipartUpload) {
    return json({
      multipartAvailable: false,
      message: 'Direct multipart upload is only available with S3 storage. Use POST /files for local uploads.',
    }, 501);
  }

  const body = await readJsonBody<InitiateBody>(context);
  if (body instanceof Response) return body;

  const sha256 = body.sha256?.trim().toLowerCase();
  const fileName = body.fileName?.trim();
  const mimeType = body.mimeType?.trim() || 'application/octet-stream';
  const fileSize = body.fileSize;

  if (!sha256 || !isValidSha256(sha256)) {
    return jsonError('A valid sha256 hash is required');
  }
  if (!fileName) {
    return jsonError('fileName is required');
  }
  if (!fileSize || !Number.isFinite(fileSize) || fileSize <= 0) {
    return jsonError('fileSize must be a positive number');
  }

  const maxUploadBytes = getMaxUploadBytes();
  if (fileSize > maxUploadBytes) {
    return jsonError(`File must be under ${maxUploadBytes} bytes`);
  }

  const existingBlob = await findBlobBySha256(sha256);
  if (existingBlob) {
    const linked = await linkBlobToVersion(
      auth.user.id,
      versionId,
      existingBlob,
      fileSize,
      false,
    );

    return json({
      multipartAvailable: true,
      deduplicated: true,
      file: {
        ...existingBlob,
        userAssetFileId: linked.id,
      },
    });
  }

  const activeSession = await db.query.pendingUploads.findFirst({
    where: and(
      eq(pendingUploads.sha256, sha256),
      eq(pendingUploads.userId, auth.user.id),
      eq(pendingUploads.productVersionId, versionId),
      eq(pendingUploads.status, 'pending'),
    ),
  });

  if (activeSession) {
    const partSize = getMpuPartSize();
    return json({
      multipartAvailable: true,
      sessionId: activeSession.id,
      uploadId: activeSession.s3UploadId,
      storageKey: activeSession.storageKey,
      partSize,
      totalParts: computePartCount(activeSession.fileSize, partSize),
      completedParts: activeSession.completedParts,
      expiresAt: activeSession.expiresAt.toISOString(),
      resumed: true,
    });
  }

  const storageKey = computeShardedBlobKey(sha256);
  const uploadId = await storage.createMultipartUpload!(storageKey);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + getMpuSessionTtlHours());

  const [session] = await db.insert(pendingUploads).values({
    userId: auth.user.id,
    productVersionId: versionId,
    sha256,
    fileName,
    mimeType,
    fileSize,
    storageKey,
    s3UploadId: uploadId,
    expiresAt,
  }).returning();

  const partSize = getMpuPartSize();

  return json({
    multipartAvailable: true,
    sessionId: session.id,
    uploadId: session.s3UploadId,
    storageKey: session.storageKey,
    partSize,
    totalParts: computePartCount(fileSize, partSize),
    completedParts: [],
    expiresAt: session.expiresAt.toISOString(),
  }, 201);
};

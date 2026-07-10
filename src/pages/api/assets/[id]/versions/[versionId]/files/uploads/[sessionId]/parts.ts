import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../../../../../../db';
import { pendingUploads } from '../../../../../../../../../db/schema';
import { requireAuth, json, jsonError } from '../../../../../../../../../lib/api-helpers';
import { storage } from '../../../../../../../../../lib/storage';
import { computePartCount, getMpuPartSize, getMpuPresignTtlSeconds } from '../../../../../../../../../lib/upload-config';
import { readJsonBody, validateVersionAccess } from '../../../../../../../../../lib/upload-helpers';

interface PresignBody {
  partNumbers?: number[];
}

interface ReportPartBody {
  partNumber?: number;
  etag?: string;
}

async function getPendingSession(
  sessionId: string,
  userId: string,
  productId: string,
  versionId: string,
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

  if (!session) return jsonError('Upload session not found', 404);
  if (session.status !== 'pending') return jsonError(`Upload session is ${session.status}`, 409);
  if (session.expiresAt < new Date()) return jsonError('Upload session has expired', 410);

  return session;
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

  if (!storage.getPresignedPartUrl) {
    return jsonError('Multipart upload is not available', 501);
  }

  const session = await getPendingSession(sessionId, auth.user.id, productId, versionId);
  if (session instanceof Response) return session;

  const body = await readJsonBody<PresignBody>(context);
  if (body instanceof Response) return body;

  const partNumbers = body.partNumbers;
  if (!Array.isArray(partNumbers) || partNumbers.length === 0) {
    return jsonError('partNumbers must be a non-empty array');
  }

  const totalParts = computePartCount(session.fileSize, getMpuPartSize());
  const ttl = getMpuPresignTtlSeconds();
  const urls: { partNumber: number; url: string }[] = [];

  for (const partNumber of partNumbers) {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > totalParts) {
      return jsonError(`Invalid part number: ${partNumber}`);
    }

    const url = await storage.getPresignedPartUrl(
      session.storageKey,
      session.s3UploadId,
      partNumber,
      { expiresInSeconds: ttl },
    );
    urls.push({ partNumber, url });
  }

  return json({ urls, expiresInSeconds: ttl });
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  const versionId = context.params.versionId;
  const sessionId = context.params.sessionId;
  if (!productId || !versionId || !sessionId) {
    return jsonError('Asset ID, version ID, and session ID required');
  }

  const session = await getPendingSession(sessionId, auth.user.id, productId, versionId);
  if (session instanceof Response) return session;

  const body = await readJsonBody<ReportPartBody>(context);
  if (body instanceof Response) return body;

  const partNumber = body.partNumber;
  const etag = body.etag?.trim();

  if (!partNumber || !Number.isInteger(partNumber) || partNumber < 1) {
    return jsonError('partNumber is required');
  }
  if (!etag) {
    return jsonError('etag is required');
  }

  const totalParts = computePartCount(session.fileSize, getMpuPartSize());
  if (partNumber > totalParts) {
    return jsonError(`Invalid part number: ${partNumber}`);
  }

  const normalizedEtag = etag.replace(/^"|"$/g, '');
  const merged = new Map(session.completedParts.map((part) => [part.partNumber, part.etag]));
  merged.set(partNumber, normalizedEtag);

  const completedParts = Array.from(merged.entries())
    .map(([num, tag]) => ({ partNumber: num, etag: tag }))
    .sort((a, b) => a.partNumber - b.partNumber);

  await db.update(pendingUploads)
    .set({ completedParts })
    .where(eq(pendingUploads.id, session.id));

  return json({ success: true, completedParts });
};

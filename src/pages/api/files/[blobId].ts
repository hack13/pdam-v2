import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db';
import { userAssetFiles, globalFileBlobs, blobStorageObjects } from '../../../db/schema';
import { requireAuth } from '../../../lib/api-helpers';
import { getFileByBlobId } from '../../../lib/file-pipeline';

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const blobId = context.params.blobId;
  if (!blobId) {
    return new Response('Missing blob ID', { status: 400 });
  }

  const userFile = await db.query.userAssetFiles.findFirst({
    where: and(
      eq(userAssetFiles.blobId, blobId),
      eq(userAssetFiles.userId, auth.user.id),
    ),
  });

  if (!userFile) {
    return new Response('File not found or access denied', { status: 404 });
  }

  const blob = await db.query.globalFileBlobs.findFirst({
    where: eq(globalFileBlobs.id, blobId),
  });

  if (!blob) {
    return new Response('Blob metadata not found', { status: 404 });
  }

  const ifNoneMatch = context.request.headers.get('If-None-Match');
  const ifModifiedSince = context.request.headers.get('If-Modified-Since');

  const etag = `"${blob.sha256}"`;
  const lastModified = blob.createdAt.toUTCString();

  if (ifNoneMatch === etag || ifModifiedSince === lastModified) {
    return new Response(null, { status: 304 });
  }

  const file = await getFileByBlobId(blobId);
  if (!file) {
    return new Response('File data not found', { status: 404 });
  }

  return new Response(file.data, {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.data.length),
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': etag,
      'Last-Modified': lastModified,
    },
  });
};

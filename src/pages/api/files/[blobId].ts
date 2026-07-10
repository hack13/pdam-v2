import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db';
import { userAssetFiles, globalFileBlobs } from '../../../db/schema';
import { requireAuth } from '../../../lib/api-helpers';
import { getFileByBlobId } from '../../../lib/file-pipeline';
import { contentDispositionForDownload } from '../../../lib/download-headers';

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
    return new Response(null, {
      status: 304,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  const file = await getFileByBlobId(blobId);
  if (!file) {
    return new Response('File data not found', { status: 404 });
  }

  return new Response(new Uint8Array(file.data), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.data.length),
      'Content-Disposition': contentDispositionForDownload(file.fileName),
      // This endpoint is authorization-gated; shared caches must never replay
      // a file response to another user who knows the blob ID.
      'Cache-Control': 'private, no-store',
      'ETag': etag,
      'Last-Modified': lastModified,
    },
  });
};

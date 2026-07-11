import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db';
import { userAssetFiles, globalFileBlobs } from '../../../db/schema';
import { requireAuth } from '../../../lib/api-helpers';
import { getFileStreamByBlobId } from '../../../lib/file-pipeline';
import { contentDispositionForDownload } from '../../../lib/download-headers';
import { Readable } from 'node:stream';

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

  if (!context.request.headers.has('Range') && (ifNoneMatch === etag || ifModifiedSince === lastModified)) {
    return new Response(null, {
      status: 304,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  const rangeHeader = context.request.headers.get('Range');
  let range: { start: number; end: number } | undefined;
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match || (!match[1] && !match[2])) {
      return new Response('Invalid range', { status: 416, headers: { 'Content-Range': `bytes */${blob.fileSize}` } });
    }
    const requestedStart = match[1] ? Number(match[1]) : undefined;
    const requestedEnd = match[2] ? Number(match[2]) : undefined;
    if (requestedStart !== undefined && requestedEnd !== undefined && requestedStart > requestedEnd) {
      return new Response('Invalid range', { status: 416, headers: { 'Content-Range': `bytes */${blob.fileSize}` } });
    }
    if (requestedStart === undefined) {
      const suffixLength = requestedEnd!;
      if (suffixLength <= 0) {
        return new Response('Invalid range', { status: 416, headers: { 'Content-Range': `bytes */${blob.fileSize}` } });
      }
      range = { start: Math.max(0, blob.fileSize - suffixLength), end: blob.fileSize - 1 };
    } else {
      if (requestedStart >= blob.fileSize) {
        return new Response('Range not satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${blob.fileSize}` } });
      }
      range = { start: requestedStart, end: Math.min(requestedEnd ?? blob.fileSize - 1, blob.fileSize - 1) };
    }
  }

  const file = await getFileStreamByBlobId(blobId, range);
  if (!file) {
    return new Response('File data not found', { status: 404 });
  }

  const responseStart = range?.start ?? 0;
  const responseEnd = range?.end ?? file.fileSize - 1;
  const responseLength = responseEnd - responseStart + 1;
  const headers = {
    'Content-Type': file.mimeType,
    'Content-Length': String(responseLength),
    'Content-Disposition': contentDispositionForDownload(file.fileName),
    'Accept-Ranges': 'bytes',
    // Authorization is checked above for every request, including ranges.
    'Cache-Control': 'private, no-store',
    'ETag': etag,
    'Last-Modified': lastModified,
    ...(range ? { 'Content-Range': `bytes ${responseStart}-${responseEnd}/${file.fileSize}` } : {}),
  };

  return new Response(
    Readable.toWeb(Readable.from(file.stream)) as unknown as ReadableStream,
    { status: range ? 206 : 200, headers },
  );
};

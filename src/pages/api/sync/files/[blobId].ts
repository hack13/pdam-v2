import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { globalFileBlobs, userAssetFiles } from '../../../../db/schema';
import { requireSyncAuth, jsonError } from '../../../../lib/api-helpers';
import { getFileByBlobId } from '../../../../lib/file-pipeline';
import { contentDispositionForDownload } from '../../../../lib/download-headers';

export const GET: APIRoute = async (context) => {
  const auth = await requireSyncAuth(context, 'sync:read');
  if (auth instanceof Response) return auth;
  const blobId = context.params.blobId;
  if (!blobId) return jsonError('Blob ID required');
  const owned = await db.query.userAssetFiles.findFirst({ where: and(eq(userAssetFiles.userId, auth.user.id), eq(userAssetFiles.blobId, blobId)) });
  const blob = await db.query.globalFileBlobs.findFirst({ where: eq(globalFileBlobs.id, blobId) });
  if (!owned || !blob) return jsonError('File not found', 404);
  const etag = `"${blob.sha256}"`;
  if (context.request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  const file = await getFileByBlobId(blobId);
  if (!file) return jsonError('File data not found', 404);
  return new Response(new Uint8Array(file.data), { headers: { 'Content-Type': file.mimeType, 'Content-Length': String(file.data.length), 'Content-Disposition': contentDispositionForDownload(file.fileName), 'Cache-Control': 'private, no-store', ETag: etag } });
};

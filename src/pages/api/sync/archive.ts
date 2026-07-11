import type { APIRoute } from 'astro';
import { requireSyncAuth } from '../../../lib/api-helpers';
import { buildArchiveHtml } from '../../../lib/archive-html';
import { buildSyncManifest } from '../../../lib/sync-manifest';

export const GET: APIRoute = async (context) => {
  const auth = await requireSyncAuth(context, 'sync:manifest');
  if (auth instanceof Response) return auth;
  const manifest = await buildSyncManifest(auth.user.id, null);
  return new Response(buildArchiveHtml(manifest), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
};

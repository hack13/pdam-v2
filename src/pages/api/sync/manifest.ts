import type { APIRoute } from 'astro';
import { requireSyncAuth, json } from '../../../lib/api-helpers';
import { buildSyncManifest } from '../../../lib/sync-manifest';

export const GET: APIRoute = async (context) => {
  const auth = await requireSyncAuth(context, 'sync:manifest');
  if (auth instanceof Response) return auth;
  return json(await buildSyncManifest(auth.user.id, new URL(context.request.url).searchParams.get('cursor')));
};

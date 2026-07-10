import type { APIRoute } from 'astro';
import { requireSyncAuth, json } from '../../../lib/api-helpers';
import { buildSyncManifest } from '../../../lib/sync-manifest';

export const POST: APIRoute = async (context) => {
  const auth = await requireSyncAuth(context, 'sync:export');
  if (auth instanceof Response) return auth;
  const manifest = await buildSyncManifest(auth.user.id, null);
  return json({ status: 'completed', manifest }, 201);
};

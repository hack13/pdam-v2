import type { APIRoute } from 'astro';
import { json, jsonError } from '../../../lib/api-helpers';
import { enqueueDueScheduledConnections } from '../../../lib/sync-scheduler';

export const POST: APIRoute = async (context) => {
  const configured = import.meta.env.SYNC_WORKER_SECRET ?? process.env.SYNC_WORKER_SECRET;
  if (!configured) return jsonError('Sync scheduler secret is not configured on the application', 500);
  if (context.request.headers.get('x-sync-worker-secret') !== configured) return jsonError('Invalid sync scheduler secret', 401);
  const limit = Math.min(Math.max(Number(new URL(context.request.url).searchParams.get('limit') ?? 100), 1), 500);
  const results = await enqueueDueScheduledConnections(new Date(), limit);
  console.info('[sync-scheduler] scheduled jobs queued', { count: results.length, limit });
  return json({ results });
};

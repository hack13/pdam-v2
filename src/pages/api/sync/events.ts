import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db, client } from '../../../db';
import { syncRuns } from '../../../db/schema';
import { requireAuth } from '../../../lib/api-helpers';
import { SYNC_PROGRESS_CHANNEL } from '../../../lib/sync-events';

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const encoder = new TextEncoder();
  let cleanup: (() => Promise<void>) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let listener: { unlisten(): Promise<void> } | undefined;

      const close = async () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (listener) await listener.unlisten().catch(() => {});
        try {
          controller.close();
        } catch {
          // The client or runtime may have already closed the stream.
        }
      };
      cleanup = close;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          void close();
        }
      };

      context.request.signal.addEventListener('abort', () => void close(), { once: true });

      try {
        // Flush an initial SSE frame so the browser/proxy establishes the
        // stream before the first sync notification arrives.
        controller.enqueue(encoder.encode(': connected\n\n'));
        listener = await client.listen(SYNC_PROGRESS_CHANNEL, async (runId) => {
          if (closed) return;
          const run = await db.query.syncRuns.findFirst({ where: and(eq(syncRuns.id, runId), eq(syncRuns.userId, auth.user.id)) });
          if (run) send({ run });
        });

        const runs = await db.query.syncRuns.findMany({
          where: eq(syncRuns.userId, auth.user.id),
          orderBy: (table, { desc }) => [desc(table.createdAt)],
          limit: 50,
        });
        send({ runs });
        heartbeat = setInterval(() => send({ heartbeat: Date.now() }), 15000);
      } catch (error) {
        console.error('[sync-events] SSE stream failed', { userId: auth.user.id, error });
        await close();
      }
    },
    cancel() { void cleanup?.(); },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    },
  });
};

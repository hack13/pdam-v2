import type { APIRoute } from 'astro';
import { storage } from '../../../../lib/storage';

export const GET: APIRoute = async (context) => {
  const userId = context.params.id;
  if (!userId || typeof userId !== 'string') {
    return new Response('Not found', { status: 404 });
  }

  const storageKey = `avatars/${userId}.webp`;

  try {
    const data = await storage.get(storageKey);

    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(data.length),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
};

import type { APIRoute } from 'astro';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../../../db';
import { creators } from '../../../../db/schema';
import { storage } from '../../../../lib/storage';

export const GET: APIRoute = async (context) => {
  const creatorId = context.params.creatorId;
  const kind = context.params.kind;
  if (!creatorId || (kind !== 'profile' && kind !== 'header')) {
    return new Response('Not found', { status: 404 });
  }

  const expectedUrl = `/api/creator-media/${creatorId}/${kind}`;
  const publicCreator = await db.query.creators.findFirst({
    where: and(
      eq(creators.id, creatorId),
      isNotNull(creators.enrolledByUserId),
      kind === 'profile'
        ? eq(creators.profileImageUrl, expectedUrl)
        : eq(creators.headerImageUrl, expectedUrl),
    ),
    columns: { id: true },
  });
  if (!publicCreator) return new Response('Not found', { status: 404 });

  try {
    const data = await storage.get(`creator-profiles/${creatorId}/${kind}.webp`);
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

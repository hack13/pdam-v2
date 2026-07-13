import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db';
import { galleryListingMedia, products } from '../../../db/schema';
import { storage } from '../../../lib/storage';

export const GET: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return new Response('Not found', { status: 404 });
  const [media] = await db
    .select({ storageKey: galleryListingMedia.storageKey })
    .from(galleryListingMedia)
    .innerJoin(
      products,
      and(
        eq(products.id, galleryListingMedia.productId),
        eq(products.isGalleryListed, true),
      ),
    )
    .where(eq(galleryListingMedia.id, id))
    .limit(1);
  if (!media?.storageKey) return new Response('Not found', { status: 404 });

  try {
    const data = await storage.get(media.storageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
};

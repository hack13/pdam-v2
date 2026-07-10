import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db';
import {
  products,
  galleryPurchaseLinks,
  marketplaceClickEvents,
} from '../../../../db/schema';
import { json, jsonError } from '../../../../lib/api-helpers';
import { getSessionFromContext } from '../../../../lib/session';

export const POST: APIRoute = async (context) => {
  const productId = context.params.id;
  if (!productId) return jsonError('Listing ID required');

  let body: { purchaseLinkId?: string };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (!body.purchaseLinkId) return jsonError('purchaseLinkId is required');

  const listing = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.isGalleryListed, true)),
    columns: { id: true },
  });
  if (!listing) return jsonError('Listing not found', 404);

  const link = await db.query.galleryPurchaseLinks.findFirst({
    where: and(
      eq(galleryPurchaseLinks.id, body.purchaseLinkId),
      eq(galleryPurchaseLinks.productId, productId),
    ),
  });
  if (!link) return jsonError('Purchase link not found', 404);

  const session = await getSessionFromContext(context);

  await db.insert(marketplaceClickEvents).values({
    productId,
    purchaseLinkId: link.id,
    marketplaceSourceId: link.marketplaceSourceId,
    userId: session?.user?.id ?? null,
  });

  return json({ ok: true, url: link.productUrl });
};

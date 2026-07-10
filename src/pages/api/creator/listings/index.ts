import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { products, galleryPurchaseLinks } from '../../../../db/schema';
import {
  requireCreator,
  getLinkedCreator,
  productTaggedWithCreator,
} from '../../../../lib/creator';
import { getCreatorListings } from '../../../../lib/creator-stats';
import { json, jsonError } from '../../../../lib/api-helpers';

export const GET: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const listings = await getCreatorListings(auth.user.id);
  return json({ listings });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const linked = await getLinkedCreator(auth.user.id);
  if (!linked) {
    return jsonError('Link a creator profile before listing assets in the gallery', 400);
  }

  let body: {
    productId?: string;
    purchaseLinks?: Array<{
      marketplaceSourceId: string;
      productUrl: string;
      label?: string;
    }>;
  };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (!body.productId) return jsonError('productId is required');
  if (!body.purchaseLinks || body.purchaseLinks.length === 0) {
    return jsonError('At least one purchase link is required');
  }

  for (const link of body.purchaseLinks) {
    if (!link.marketplaceSourceId || !link.productUrl?.trim()) {
      return jsonError('Each purchase link needs a marketplace and URL');
    }
    try {
      new URL(link.productUrl.trim());
    } catch {
      return jsonError('Purchase link URLs must be valid');
    }
  }

  const product = await db.query.products.findFirst({
    where: and(eq(products.id, body.productId), eq(products.ownerUserId, auth.user.id)),
  });
  if (!product) return jsonError('Asset not found', 404);
  if (product.sourceProductId) {
    return jsonError('Linked library copies cannot be listed in the gallery');
  }
  if (!productTaggedWithCreator(product, linked.id)) {
    return jsonError(
      `Only assets tagged with your linked creator "${linked.name}" can be listed`,
      403,
    );
  }

  await db
    .update(products)
    .set({
      isGalleryListed: true,
      updatedAt: new Date(),
    })
    .where(eq(products.id, product.id));

  await db.delete(galleryPurchaseLinks).where(eq(galleryPurchaseLinks.productId, product.id));

  const inserted = await db
    .insert(galleryPurchaseLinks)
    .values(
      body.purchaseLinks.map((link, index) => ({
        productId: product.id,
        marketplaceSourceId: link.marketplaceSourceId,
        productUrl: link.productUrl.trim(),
        label: link.label?.trim() || null,
        sortOrder: index,
      })),
    )
    .returning();

  return json({ productId: product.id, isGalleryListed: true, purchaseLinks: inserted }, 201);
};

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { products, galleryPurchaseLinks } from '../../../../db/schema';
import { requireCreator } from '../../../../lib/creator';
import { json, jsonError } from '../../../../lib/api-helpers';

async function getOwnedListing(productId: string, userId: string) {
  return db.query.products.findFirst({
    where: and(
      eq(products.id, productId),
      eq(products.ownerUserId, userId),
      eq(products.isGalleryListed, true),
    ),
  });
}

export const GET: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  if (!productId) return jsonError('Listing ID required');

  const listing = await getOwnedListing(productId, auth.user.id);
  if (!listing) return jsonError('Listing not found', 404);

  const purchaseLinks = await db.query.galleryPurchaseLinks.findMany({
    where: eq(galleryPurchaseLinks.productId, productId),
    orderBy: (table, { asc }) => [asc(table.sortOrder)],
  });

  return json({ ...listing, purchaseLinks });
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  if (!productId) return jsonError('Listing ID required');

  const listing = await getOwnedListing(productId, auth.user.id);
  if (!listing) return jsonError('Listing not found', 404);

  let body: {
    purchaseLinks?: Array<{
      marketplaceSourceId: string;
      productUrl: string;
      marketplaceProductId: string;
      label?: string;
    }>;
  };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (!body.purchaseLinks || body.purchaseLinks.length === 0) {
    return jsonError('At least one purchase link is required');
  }

  for (const link of body.purchaseLinks) {
    if (!link.marketplaceSourceId || !link.productUrl?.trim() || !link.marketplaceProductId?.trim()) {
      return jsonError('Each purchase link needs a marketplace, URL, and marketplace product ID');
    }
    try {
      new URL(link.productUrl.trim());
    } catch {
      return jsonError('Purchase link URLs must be valid');
    }
  }

  await db.delete(galleryPurchaseLinks).where(eq(galleryPurchaseLinks.productId, productId));
  const inserted = await db
    .insert(galleryPurchaseLinks)
    .values(
      body.purchaseLinks.map((link, index) => ({
        productId,
        marketplaceSourceId: link.marketplaceSourceId,
        productUrl: link.productUrl.trim(),
        marketplaceProductId: link.marketplaceProductId.trim(),
        label: link.label?.trim() || null,
        sortOrder: index,
      })),
    )
    .returning();

  await db
    .update(products)
    .set({ updatedAt: new Date() })
    .where(eq(products.id, productId));

  return json({ productId, purchaseLinks: inserted });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  if (!productId) return jsonError('Listing ID required');

  const listing = await getOwnedListing(productId, auth.user.id);
  if (!listing) return jsonError('Listing not found', 404);

  await db.delete(galleryPurchaseLinks).where(eq(galleryPurchaseLinks.productId, productId));
  await db
    .update(products)
    .set({
      isGalleryListed: false,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));

  return json({ success: true, isGalleryListed: false });
};

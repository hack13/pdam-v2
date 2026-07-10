import type { APIRoute } from 'astro';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../../../db';
import {
  products,
  productVersions,
  galleryPurchaseLinks,
  marketplaceSources,
  creators,
  fileThumbnails,
  ownershipVerifications,
} from '../../../../db/schema';
import { json, jsonError } from '../../../../lib/api-helpers';
import { getSessionFromContext } from '../../../../lib/session';

export const GET: APIRoute = async (context) => {
  const productId = context.params.id;
  if (!productId) return jsonError('Listing ID required');

  const listing = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.isGalleryListed, true)),
  });

  if (!listing) return jsonError('Listing not found', 404);

  const thumbnail = listing.thumbnailFileThumbnailId
    ? await db.query.fileThumbnails.findFirst({
        where: eq(fileThumbnails.id, listing.thumbnailFileThumbnailId),
      })
    : null;

  const productCreators =
    listing.creatorIds && listing.creatorIds.length > 0
      ? await db.query.creators.findMany({
          where: inArray(creators.id, listing.creatorIds),
        })
      : [];

  const links = await db.query.galleryPurchaseLinks.findMany({
    where: eq(galleryPurchaseLinks.productId, productId),
    orderBy: (table, { asc }) => [asc(table.sortOrder)],
  });

  const marketplaceIds = [...new Set(links.map((l) => l.marketplaceSourceId))];
  const marketplaces =
    marketplaceIds.length > 0
      ? await db.query.marketplaceSources.findMany({
          where: inArray(marketplaceSources.id, marketplaceIds),
        })
      : [];
  const marketplaceMap = Object.fromEntries(marketplaces.map((m) => [m.id, m]));

  const versions = await db.query.productVersions.findMany({
    where: eq(productVersions.productId, productId),
    orderBy: [productVersions.createdAt],
  });

  const session = await getSessionFromContext(context);
  let alreadyOwned = false;
  let linkedProductId: string | null = null;

  if (session?.user) {
    const linked = await db.query.products.findFirst({
      where: and(
        eq(products.ownerUserId, session.user.id),
        eq(products.sourceProductId, productId),
      ),
      columns: { id: true },
    });
    if (linked) {
      alreadyOwned = true;
      linkedProductId = linked.id;
    } else {
      const verified = await db.query.ownershipVerifications.findFirst({
        where: and(
          eq(ownershipVerifications.userId, session.user.id),
          eq(ownershipVerifications.productId, productId),
          eq(ownershipVerifications.status, 'verified'),
        ),
      });
      if (verified?.linkedProductId) {
        alreadyOwned = true;
        linkedProductId = verified.linkedProductId;
      }
    }
  }

  return json({
    id: listing.id,
    title: listing.title,
    slug: listing.slug,
    descriptionText: listing.descriptionText,
    tags: listing.tags,
    thumbnailUrl: thumbnail ? `/api/thumbnail/${thumbnail.id}` : null,
    creators: productCreators.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    purchaseLinks: links.map((l) => ({
      id: l.id,
      productUrl: l.productUrl,
      label: l.label,
      sortOrder: l.sortOrder,
      marketplace: marketplaceMap[l.marketplaceSourceId]
        ? {
            id: marketplaceMap[l.marketplaceSourceId].id,
            name: marketplaceMap[l.marketplaceSourceId].name,
            slug: marketplaceMap[l.marketplaceSourceId].slug,
          }
        : null,
    })),
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      releaseNotes: v.releaseNotes,
      publishedAt: v.publishedAt,
      createdAt: v.createdAt,
    })),
    alreadyOwned,
    linkedProductId,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  });
};

import type { APIRoute } from 'astro';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../../db';
import {
  products,
  galleryPurchaseLinks,
  marketplaceSources,
  creators,
  fileThumbnails,
  ownershipVerifications,
} from '../../../db/schema';
import { json } from '../../../lib/api-helpers';
import { getSessionFromContext } from '../../../lib/session';

export const GET: APIRoute = async (context) => {
  const listings = await db.query.products.findMany({
    where: eq(products.isGalleryListed, true),
    orderBy: [desc(products.updatedAt)],
  });

  const thumbIds = listings
    .map((l) => l.thumbnailFileThumbnailId)
    .filter((id): id is string => !!id);
  const thumbs =
    thumbIds.length > 0
      ? await db.query.fileThumbnails.findMany({
          where: inArray(fileThumbnails.id, thumbIds),
        })
      : [];
  const thumbSet = new Set(thumbs.map((t) => t.id));

  const allCreatorIds = [...new Set(listings.flatMap((l) => l.creatorIds ?? []))];
  const creatorsList =
    allCreatorIds.length > 0
      ? await db.query.creators.findMany({
          where: inArray(creators.id, allCreatorIds),
        })
      : [];
  const creatorMap = Object.fromEntries(creatorsList.map((c) => [c.id, c]));

  const listingIds = listings.map((l) => l.id);
  const links =
    listingIds.length > 0
      ? await db.query.galleryPurchaseLinks.findMany({
          where: inArray(galleryPurchaseLinks.productId, listingIds),
        })
      : [];

  const marketplaceIds = [
    ...new Set(links.map((l) => l.marketplaceSourceId)),
  ];
  const marketplaces =
    marketplaceIds.length > 0
      ? await db.query.marketplaceSources.findMany({
          where: inArray(marketplaceSources.id, marketplaceIds),
        })
      : [];
  const marketplaceMap = Object.fromEntries(marketplaces.map((m) => [m.id, m]));

  const session = await getSessionFromContext(context);
  let ownedSourceIds = new Set<string>();
  if (session?.user) {
    const owned = await db.query.products.findMany({
      where: and(
        eq(products.ownerUserId, session.user.id),
      ),
      columns: { sourceProductId: true },
    });
    ownedSourceIds = new Set(
      owned.map((o) => o.sourceProductId).filter((id): id is string => !!id),
    );

    const verified = await db.query.ownershipVerifications.findMany({
      where: and(
        eq(ownershipVerifications.userId, session.user.id),
        eq(ownershipVerifications.status, 'verified'),
      ),
      columns: { productId: true },
    });
    for (const v of verified) ownedSourceIds.add(v.productId);
  }

  const items = listings.map((listing) => {
    const purchaseLinks = links
      .filter((l) => l.productId === listing.id)
      .map((l) => ({
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
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      id: listing.id,
      title: listing.title,
      slug: listing.slug,
      descriptionText: listing.descriptionText,
      tags: listing.tags,
      thumbnailUrl: listing.thumbnailFileThumbnailId && thumbSet.has(listing.thumbnailFileThumbnailId)
        ? `/api/thumbnail/${listing.thumbnailFileThumbnailId}`
        : null,
      creators: (listing.creatorIds ?? [])
        .map((id) => creatorMap[id])
        .filter(Boolean)
        .map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
      purchaseLinks,
      alreadyOwned: ownedSourceIds.has(listing.id),
      updatedAt: listing.updatedAt,
    };
  });

  return json({ items });
};

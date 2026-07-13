import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  products,
  ownershipVerifications,
  marketplaceClickEvents,
  galleryPurchaseLinks,
  galleryListingMedia,
  marketplaceSources,
} from '../db/schema';

export async function getCreatorDashboardStats(creatorUserId: string) {
  const listings = await db.query.products.findMany({
    where: and(
      eq(products.ownerUserId, creatorUserId),
      eq(products.isGalleryListed, true),
    ),
    columns: { id: true },
  });

  const listingIds = listings.map((l) => l.id);
  const listingCount = listingIds.length;

  let ownershipConfirmations = 0;
  let marketplaceClicks: Array<{
    marketplaceSourceId: string;
    marketplaceName: string;
    clicks: number;
  }> = [];

  if (listingIds.length > 0) {
    const verified = await db.query.ownershipVerifications.findMany({
      where: and(
        inArray(ownershipVerifications.productId, listingIds),
        eq(ownershipVerifications.status, 'verified'),
      ),
      columns: { id: true },
    });
    ownershipConfirmations = verified.length;

    const clickRows = await db
      .select({
        marketplaceSourceId: marketplaceClickEvents.marketplaceSourceId,
        clicks: sql<number>`count(*)::int`,
      })
      .from(marketplaceClickEvents)
      .where(inArray(marketplaceClickEvents.productId, listingIds))
      .groupBy(marketplaceClickEvents.marketplaceSourceId);

    const sourceIds = clickRows.map((r) => r.marketplaceSourceId);
    const sources =
      sourceIds.length > 0
        ? await db.query.marketplaceSources.findMany({
            where: inArray(marketplaceSources.id, sourceIds),
          })
        : [];
    const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s.name]));

    marketplaceClicks = clickRows.map((r) => ({
      marketplaceSourceId: r.marketplaceSourceId,
      marketplaceName: sourceMap[r.marketplaceSourceId] ?? 'Unknown',
      clicks: Number(r.clicks),
    }));
  }

  return {
    listingCount,
    ownershipConfirmations,
    marketplaceClicks,
    totalMarketplaceClicks: marketplaceClicks.reduce((sum, r) => sum + r.clicks, 0),
  };
}

export async function getCreatorListings(creatorUserId: string) {
  const listings = await db.query.products.findMany({
    where: and(
      eq(products.ownerUserId, creatorUserId),
      eq(products.isGalleryListed, true),
    ),
    orderBy: (table, { desc }) => [desc(table.updatedAt)],
  });

  const listingIds = listings.map((l) => l.id);
  const links =
    listingIds.length > 0
      ? await db.query.galleryPurchaseLinks.findMany({
          where: inArray(galleryPurchaseLinks.productId, listingIds),
        })
      : [];
  const media =
    listingIds.length > 0
      ? await db.query.galleryListingMedia.findMany({
          where: inArray(galleryListingMedia.productId, listingIds),
          orderBy: (table, { asc }) => [asc(table.sortOrder)],
        })
      : [];

  const ownershipCounts =
    listingIds.length > 0
      ? await db
          .select({
            productId: ownershipVerifications.productId,
            count: sql<number>`count(*)::int`,
          })
          .from(ownershipVerifications)
          .where(
            and(
              inArray(ownershipVerifications.productId, listingIds),
              eq(ownershipVerifications.status, 'verified'),
            ),
          )
          .groupBy(ownershipVerifications.productId)
      : [];

  const clickCounts =
    listingIds.length > 0
      ? await db
          .select({
            productId: marketplaceClickEvents.productId,
            count: sql<number>`count(*)::int`,
          })
          .from(marketplaceClickEvents)
          .where(inArray(marketplaceClickEvents.productId, listingIds))
          .groupBy(marketplaceClickEvents.productId)
      : [];

  const ownershipMap = Object.fromEntries(
    ownershipCounts.map((r) => [r.productId, Number(r.count)]),
  );
  const clickMap = Object.fromEntries(clickCounts.map((r) => [r.productId, Number(r.count)]));
  const linksByProduct = new Map<string, typeof links>();
  const mediaByProduct = new Map<string, typeof media>();
  for (const link of links) {
    const list = linksByProduct.get(link.productId) ?? [];
    list.push(link);
    linksByProduct.set(link.productId, list);
  }
  for (const item of media) {
    const list = mediaByProduct.get(item.productId) ?? [];
    list.push(item);
    mediaByProduct.set(item.productId, list);
  }

  return listings.map((listing) => ({
    ...listing,
    purchaseLinks: linksByProduct.get(listing.id) ?? [],
    galleryMedia: mediaByProduct.get(listing.id) ?? [],
    ownershipConfirmations: ownershipMap[listing.id] ?? 0,
    marketplaceClicks: clickMap[listing.id] ?? 0,
  }));
}

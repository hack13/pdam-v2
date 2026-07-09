import type { APIRoute } from 'astro';
import { eq, inArray, ilike } from 'drizzle-orm';
import { db } from '../../../../db';
import { products, productVersions, globalFileBlobs, fileThumbnails, userAssetFiles, marketplaceSources, creators } from '../../../../db/schema';
import { requireAuth, json, jsonError, slugify } from '../../../../lib/api-helpers';
import { deleteAsset } from '../../../../lib/asset-service';

async function resolveCreatorIds(
  entries: Array<{ id?: string; name: string }>
): Promise<string[]> {
  const ids: string[] = [];
  for (const entry of entries) {
    if (entry.id && !entry.id.startsWith('new:')) {
      ids.push(entry.id);
    } else if (entry.name?.trim()) {
      const trimmed = entry.name.trim();
      const existing = await db.query.creators.findFirst({
        where: ilike(creators.name, trimmed),
      });
      if (existing) {
        ids.push(existing.id);
      } else {
        const [newCreator] = await db.insert(creators).values({
          name: trimmed,
          slug: slugify(trimmed),
        }).returning();
        ids.push(newCreator.id);
      }
    }
  }
  return ids;
}

async function fetchCreatorsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.query.creators.findMany({
    where: (table) => inArray(table.id, ids),
  });
}

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  if (!productId) return jsonError('Asset ID required');

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product || product.ownerUserId !== auth.user.id) {
    return jsonError('Not found', 404);
  }

  let marketplaceSource = null;
  if (product.marketplaceSourceId) {
    marketplaceSource = await db.query.marketplaceSources.findFirst({
      where: eq(marketplaceSources.id, product.marketplaceSourceId),
    }) ?? null;
  }

  const productCreators = await fetchCreatorsByIds(product.creatorIds ?? []);

  const versions = await db.query.productVersions.findMany({
    where: eq(productVersions.productId, productId),
    orderBy: [productVersions.createdAt],
  });

  const versionIds = versions.map((v) => v.id);

  const files = versionIds.length > 0
    ? await db.query.userAssetFiles.findMany({
        where: (table) => inArray(table.productVersionId, versionIds),
      })
    : [];

  const blobIds = files.map((f) => f.blobId);
  const blobs = blobIds.length > 0
    ? await db.query.globalFileBlobs.findMany({
        where: (table) => inArray(table.id, blobIds),
      })
    : [];
  const blobMap = new Map(blobs.map((b): [string, typeof b] => [b.id, b]));

  let thumbnail: typeof fileThumbnails.$inferSelect | null = null;
  if (product.thumbnailFileThumbnailId) {
    thumbnail = await db.query.fileThumbnails.findFirst({
      where: eq(fileThumbnails.id, product.thumbnailFileThumbnailId),
    }) ?? null;
  }

  const versionFilesMap = new Map<string, (typeof globalFileBlobs.$inferSelect)[]>();
  for (const f of files) {
    const blob = blobMap.get(f.blobId);
    if (!blob) continue;
    const list = versionFilesMap.get(f.productVersionId!) ?? [];
    list.push(blob);
    versionFilesMap.set(f.productVersionId!, list);
  }

  return json({
    ...product,
    marketplaceSource,
    creators: productCreators,
    thumbnail,
    versions: versions.map((v) => ({
      ...v,
      files: versionFilesMap.get(v.id) ?? [],
    })),
  });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  if (!productId || productId === 'undefined') return jsonError('Asset ID required');

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product || product.ownerUserId !== auth.user.id) {
    return jsonError('Not found', 404);
  }

  try {
    await deleteAsset(product.id, auth.user.id);
    return json({ success: true });
  } catch (err) {
    console.error('Failed to delete asset:', err);
    return jsonError('Failed to delete asset', 500);
  }
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  if (!productId) return jsonError('Asset ID required');

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product || product.ownerUserId !== auth.user.id) {
    return jsonError('Not found', 404);
  }

  let body: {
    title?: string;
    description?: string;
    tags?: string;
    licenseKey?: string;
    marketplaceSourceId?: string;
    productUrl?: string;
    creators?: Array<{ id?: string; name: string }>;
    creatorId?: string;
    creatorName?: string;
  };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  const updates: Record<string, string | string[] | null> = {};

  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) return jsonError('Title cannot be empty');
    updates.title = title;
  }

  if (body.description !== undefined) {
    updates.descriptionText = body.description.trim() || null;
  }

  if (body.tags !== undefined) {
    updates.tags = body.tags
      ? body.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];
  }

  if (body.licenseKey !== undefined) {
    updates.licenseKey = body.licenseKey.trim() || null;
  }

  if (body.marketplaceSourceId !== undefined) {
    updates.marketplaceSourceId = body.marketplaceSourceId.trim() || null;
  }

  if (body.productUrl !== undefined) {
    updates.productUrl = body.productUrl.trim() || null;
  }

  if (body.creators !== undefined) {
    const resolved = await resolveCreatorIds(body.creators);
    updates.creatorIds = resolved.length > 0 ? resolved : null;
  } else if (body.creatorId !== undefined || body.creatorName !== undefined) {
    const resolved = await resolveCreatorIds([{
      id: body.creatorId,
      name: body.creatorName?.trim() || '',
    }]);
    updates.creatorIds = resolved.length > 0 ? resolved : null;
  }

  if (Object.keys(updates).length === 0) {
    return json(product);
  }

  updates.updatedAt = new Date() as any;

  const [updated] = await db.update(products)
    .set(updates)
    .where(eq(products.id, productId))
    .returning();

  return json(updated);
};

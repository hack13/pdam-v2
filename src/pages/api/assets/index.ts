import type { APIRoute } from 'astro';
import { eq, desc, and, ilike } from 'drizzle-orm';
import { db } from '../../../db';
import { products, creators } from '../../../db/schema';
import { requireAuth, json, jsonError, slugify } from '../../../lib/api-helpers';

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

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

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

  if (!body.title?.trim()) {
    return jsonError('Title is required');
  }

  let creatorIds: string[] = [];
  if (body.creators && body.creators.length > 0) {
    creatorIds = await resolveCreatorIds(body.creators);
  } else if (body.creatorId || body.creatorName?.trim()) {
    creatorIds = await resolveCreatorIds([{
      id: body.creatorId,
      name: body.creatorName?.trim() || '',
    }]);
  }

  const baseSlug = slugify(body.title);
  let slug = baseSlug;
  let counter = 0;

  while (true) {
    const existing = await db.query.products.findFirst({
      where: and(eq(products.ownerUserId, auth.user.id), eq(products.slug, slug)),
    });
    if (!existing) break;
    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  const [product] = await db.insert(products).values({
    title: body.title.trim(),
    slug,
    descriptionText: body.description?.trim() || null,
    tags: body.tags
      ? body.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [],
    licenseKey: body.licenseKey?.trim() || null,
    ownerUserId: auth.user.id,
    creatorIds: creatorIds.length > 0 ? creatorIds : null,
    marketplaceSourceId: body.marketplaceSourceId || null,
    productUrl: body.productUrl?.trim() || null,
  }).returning();

  return json(product, 201);
};

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const userAssets = await db.query.products.findMany({
    where: eq(products.ownerUserId, auth.user.id),
    orderBy: [desc(products.createdAt)],
  });

  // License key is protected - strip it from list responses
  const sanitized = userAssets.map(({ licenseKey: _, ...rest }) => rest);

  return json(sanitized);
};

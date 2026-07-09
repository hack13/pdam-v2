import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { marketplaceSources } from '../../../db/schema';
import { asc, eq, or } from 'drizzle-orm';
import { json, jsonError, requireAuth } from '../../../lib/api-helpers';
import { slugify } from '../../../lib/api-helpers';

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const sources = await db.query.marketplaceSources.findMany({
    where: or(
      eq(marketplaceSources.isUserDefined, false),
      eq(marketplaceSources.ownerUserId, auth.user.id),
    ),
    orderBy: [asc(marketplaceSources.name)],
  });

  return json(sources.map((s) => ({
    ...s,
    canEdit: s.ownerUserId === auth.user.id,
  })));
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  let body: { name?: string; slug?: string; baseUrl?: string | null };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  const name = body.name?.trim();
  if (!name) return jsonError('Name is required');
  if (name.length > 100) return jsonError('Name too long (max 100 chars)');

  const slug = (body.slug?.trim()) ? body.slug.trim() : slugify(name);
  if (!/^[a-z0-9-]+$/.test(slug)) return jsonError('Slug must be lowercase letters, numbers, and hyphens');
  if (slug.length > 100) return jsonError('Slug too long (max 100 chars)');

  const baseUrl = body.baseUrl?.trim() || null;
  if (baseUrl && baseUrl.length > 500) return jsonError('URL too long (max 500 chars)');
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) return jsonError('URL must start with http:// or https://');

  const existing = await db.query.marketplaceSources.findFirst({
    where: or(
      eq(marketplaceSources.slug, slug),
      eq(marketplaceSources.name, name),
    ),
  });
  if (existing) return jsonError('A marketplace with that name or slug already exists');

  const [inserted] = await db.insert(marketplaceSources).values({
    name,
    slug,
    baseUrl,
    isUserDefined: true,
    ownerUserId: auth.user.id,
  }).returning();

  return json({ ...inserted, canEdit: true }, 201);
};

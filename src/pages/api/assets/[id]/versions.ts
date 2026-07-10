import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../db';
import { products, productVersions } from '../../../../db/schema';
import { requireAuth, json, jsonError } from '../../../../lib/api-helpers';

export const POST: APIRoute = async (context) => {
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

  if (product.sourceProductId) {
    return jsonError('Linked copies cannot add versions — sync updates from the creator instead', 403);
  }

  let body: { version?: string; releaseNotes?: string };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (!body.version?.trim()) {
    return jsonError('Version is required');
  }

  const existing = await db.query.productVersions.findFirst({
    where: and(
      eq(productVersions.productId, productId),
      eq(productVersions.version, body.version.trim()),
    ),
  });

  if (existing) {
    return jsonError(`Version "${body.version}" already exists`);
  }

  const [version] = await db.insert(productVersions).values({
    productId,
    version: body.version.trim(),
    releaseNotes: body.releaseNotes?.trim() || null,
    publishedAt: new Date(),
  }).returning();

  return json(version, 201);
};

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db';
import { creators, products, galleryPurchaseLinks, users } from '../../../db/schema';
import { requireCreator, getLinkedCreator } from '../../../lib/creator';
import { json, jsonError } from '../../../lib/api-helpers';

function serializeCreator(creator: typeof creators.$inferSelect) {
  return {
    id: creator.id,
    name: creator.name,
    slug: creator.slug,
    profileUrl: creator.profileUrl,
    avatarUrl: creator.avatarUrl,
    bio: creator.bio,
    profileImageUrl: creator.profileImageUrl,
    headerImageUrl: creator.headerImageUrl,
    marketplaceSourceId: creator.marketplaceSourceId,
    externalId: creator.externalId,
  };
}

export const GET: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const linked = await getLinkedCreator(auth.user.id);
  return json({ linkedCreator: linked ? serializeCreator(linked) : null });
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const linked = await getLinkedCreator(auth.user.id);
  if (!linked) return jsonError('Link a creator profile before editing it', 404);

  let body: { bio?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (body.bio !== undefined && typeof body.bio !== 'string') {
    return jsonError('Bio must be text');
  }

  const bio = typeof body.bio === 'string' ? body.bio.trim() : linked.bio;
  if (bio && bio.length > 1000) return jsonError('Bio must be 1,000 characters or fewer');

  const [updated] = await db
    .update(creators)
    .set({ bio: bio || null, updatedAt: new Date() })
    .where(and(eq(creators.id, linked.id), eq(creators.enrolledByUserId, auth.user.id)))
    .returning();

  return json({ linkedCreator: serializeCreator(updated) });
};

/**
 * Self-serve linking is disabled. Creator identity is granted only through
 * admin-approved onboarding applications at /api/creator/applications.
 */
export const POST: APIRoute = async () => {
  return jsonError(
    'Creator profiles are linked through admin-approved applications. Submit one at /creator/apply.',
    403,
  );
};

/** Unlink the account from its creator profile and unlist gallery items. */
export const DELETE: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const linked = await getLinkedCreator(auth.user.id);
  if (!linked) {
    return json({ success: true, linkedCreator: null });
  }

  const listed = await db.query.products.findMany({
    where: and(
      eq(products.ownerUserId, auth.user.id),
      eq(products.isGalleryListed, true),
    ),
    columns: { id: true },
  });

  for (const listing of listed) {
    await db.delete(galleryPurchaseLinks).where(eq(galleryPurchaseLinks.productId, listing.id));
    await db
      .update(products)
      .set({ isGalleryListed: false, updatedAt: new Date() })
      .where(eq(products.id, listing.id));
  }

  await db
    .update(creators)
    .set({
      enrolledByUserId: null,
      updatedAt: new Date(),
    })
    .where(and(eq(creators.id, linked.id), eq(creators.enrolledByUserId, auth.user.id)));

  if (auth.user.role === 'creator') {
    await db
      .update(users)
      .set({ role: 'user', updatedAt: new Date() })
      .where(eq(users.id, auth.user.id));
  }

  return json({
    success: true,
    linkedCreator: null,
    unlistedCount: listed.length,
  });
};

import type { APIRoute } from 'astro';
import { and, asc, eq, ilike, isNotNull } from 'drizzle-orm';
import { db } from '../../../db';
import { creators } from '../../../db/schema';
import { json, jsonError, requireAuth, slugify } from '../../../lib/api-helpers';

function serializeCreator(
  creator: typeof creators.$inferSelect,
  userId: string,
) {
  return {
    id: creator.id,
    name: creator.name,
    slug: creator.slug,
    profileUrl: creator.profileUrl,
    avatarUrl: creator.avatarUrl,
    bio: creator.bio,
    profileImageUrl: creator.profileImageUrl,
    isVerified: !!creator.enrolledByUserId,
    isVerifiedByMe: creator.enrolledByUserId === userId,
    updatedAt: creator.updatedAt,
  };
}

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const url = new URL(context.request.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const verifiedOnly = url.searchParams.get('verified') === '1';

  const filters = [
    ...(verifiedOnly ? [isNotNull(creators.enrolledByUserId)] : []),
    ...(query ? [ilike(creators.name, `%${query}%`)] : []),
  ];

  const matched = await db.query.creators.findMany({
    where: filters.length > 0 ? and(...filters) : undefined,
    orderBy: [asc(creators.name)],
  });

  return json(matched.map((c) => serializeCreator(c, auth.user.id)));
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  let body: { name?: string };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  const name = body.name?.trim();
  if (!name) return jsonError('Name is required');
  if (name.length > 100) return jsonError('Name too long (max 100 chars)');

  const existing = await db.query.creators.findFirst({
    where: ilike(creators.name, name),
  });
  if (existing) {
    return jsonError('A creator with that name already exists in the catalog');
  }

  let slug = slugify(name);
  let counter = 0;
  while (true) {
    const slugTaken = await db.query.creators.findFirst({
      where: eq(creators.slug, slug),
    });
    if (!slugTaken) break;
    counter++;
    slug = `${slugify(name)}-${counter}`;
  }

  const [inserted] = await db
    .insert(creators)
    .values({
      name,
      slug,
    })
    .returning();

  return json(serializeCreator(inserted, auth.user.id), 201);
};

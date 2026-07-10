import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { creators } from '../../../db/schema';
import { asc, ilike } from 'drizzle-orm';
import { json, jsonError, requireAuth } from '../../../lib/api-helpers';

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const url = new URL(context.request.url);
  const query = url.searchParams.get('q');

  if (!query || query.trim().length === 0) {
    return jsonError('Query parameter "q" is required');
  }

  const searchQuery = `%${query.trim()}%`;

  const matchedCreators = await db.query.creators.findMany({
    where: ilike(creators.name, searchQuery),
    orderBy: [asc(creators.name)],
    limit: 20,
  });

  return json(
    matchedCreators.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      enrolledByUserId: c.enrolledByUserId,
      isClaimed: !!c.enrolledByUserId,
      isClaimedByMe: c.enrolledByUserId === auth.user.id,
    })),
  );
};

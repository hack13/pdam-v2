import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { creators } from '../../../db/schema';
import { asc, ilike } from 'drizzle-orm';
import { json, jsonError, requireAuth } from '../../../lib/api-helpers';

export const GET: APIRoute = async (context) => {
  await requireAuth(context);

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

  return json(matchedCreators);
};

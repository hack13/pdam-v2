import type { APIRoute } from 'astro';
import { requireCreator } from '../../../lib/creator';
import { getCreatorDashboardStats } from '../../../lib/creator-stats';
import { json } from '../../../lib/api-helpers';

export const GET: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const stats = await getCreatorDashboardStats(auth.user.id);
  return json(stats);
};

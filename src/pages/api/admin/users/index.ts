import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../../lib/admin';
import { getAdminUserSummaries } from '../../../../lib/admin-stats';
import { json } from '../../../../lib/api-helpers';

export const GET: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (admin instanceof Response) return admin;

  const users = await getAdminUserSummaries();
  return json({ users });
};

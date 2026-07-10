import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../../lib/admin';
import { json } from '../../../../lib/api-helpers';
import { listCreatorApplications } from '../../../../lib/creator-applications';

export const GET: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (admin instanceof Response) return admin;

  const url = new URL(context.request.url);
  const status = url.searchParams.get('status') ?? undefined;

  const applications = await listCreatorApplications(status || undefined);
  return json({ applications });
};

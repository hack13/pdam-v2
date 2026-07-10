import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../../lib/admin';
import { json, jsonError } from '../../../../lib/api-helpers';
import {
  approveCreatorApplication,
  rejectCreatorApplication,
} from '../../../../lib/creator-applications';

export const PUT: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (admin instanceof Response) return admin;

  const applicationId = context.params.id;
  if (!applicationId) return jsonError('Application ID required');

  let body: { action?: string; adminNote?: string };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (body.action !== 'approve' && body.action !== 'reject') {
    return jsonError('action must be "approve" or "reject"');
  }

  try {
    const application =
      body.action === 'approve'
        ? await approveCreatorApplication({
            applicationId,
            adminUserId: admin.user.id,
            adminNote: body.adminNote,
          })
        : await rejectCreatorApplication({
            applicationId,
            adminUserId: admin.user.id,
            adminNote: body.adminNote,
          });

    return json({ application });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Review failed', 400);
  }
};

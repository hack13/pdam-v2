import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../../lib/admin';
import { json, jsonError } from '../../../../lib/api-helpers';
import { isFeedbackStatus, listFeedback } from '../../../../lib/feedback';

export const GET: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (admin instanceof Response) return admin;

  const requestedStatus = new URL(context.request.url).searchParams.get('status');
  if (requestedStatus && !isFeedbackStatus(requestedStatus)) {
    return jsonError('Feedback status is invalid.');
  }

  const status = requestedStatus && isFeedbackStatus(requestedStatus) ? requestedStatus : undefined;
  return json({ feedback: await listFeedback(status) });
};

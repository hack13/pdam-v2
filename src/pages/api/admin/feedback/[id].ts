import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { feedbackItems } from '../../../../db/schema';
import { requireAdmin } from '../../../../lib/admin';
import { json, jsonError } from '../../../../lib/api-helpers';
import { isFeedbackStatus } from '../../../../lib/feedback';

export const PATCH: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (admin instanceof Response) return admin;

  const feedbackId = context.params.id;
  if (!feedbackId) return jsonError('Feedback ID is required.');

  let body: { status?: string; adminNote?: string };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body.');
  }

  if (!body.status || !isFeedbackStatus(body.status)) {
    return jsonError('Feedback status is invalid.');
  }
  const adminNote = body.adminNote?.trim() ?? '';
  if (adminNote.length > 5000) return jsonError('Admin note must be 5,000 characters or fewer.');

  const [feedback] = await db
    .update(feedbackItems)
    .set({
      status: body.status,
      adminNote: adminNote || null,
      reviewedByUserId: admin.user.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(feedbackItems.id, feedbackId))
    .returning();

  if (!feedback) return jsonError('Feedback not found.', 404);
  return json({ feedback });
};

import type { APIRoute } from 'astro';
import { requireAuth, json, jsonError } from '../../../../lib/api-helpers';
import { isCreatorUser } from '../../../../lib/creator';
import { db } from '../../../../db';
import { users } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import {
  cancelCreatorApplication,
  getLatestApplication,
  getPendingApplication,
  submitCreatorApplication,
} from '../../../../lib/creator-applications';
import { getLinkedCreator } from '../../../../lib/creator';

function serializeApplication(row: {
  id: string;
  userId: string;
  creatorId: string | null;
  requestedCreatorName: string;
  proofUrls: string[] | null;
  applicantNote: string | null;
  status: string;
  adminNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    creatorId: row.creatorId,
    requestedCreatorName: row.requestedCreatorName,
    proofUrls: row.proofUrls ?? [],
    applicantNote: row.applicantNote,
    status: row.status,
    adminNote: row.adminNote,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const user = await db.query.users.findFirst({
    where: eq(users.id, auth.user.id),
  });
  if (!user) return jsonError('Unauthorized', 401);

  const latest = await getLatestApplication(auth.user.id);
  const pending = await getPendingApplication(auth.user.id);
  const linked = await getLinkedCreator(auth.user.id);

  return json({
    isCreator: isCreatorUser(user),
    linkedCreator: linked
      ? { id: linked.id, name: linked.name, slug: linked.slug }
      : null,
    latestApplication: latest ? serializeApplication(latest) : null,
    pendingApplication: pending ? serializeApplication(pending) : null,
  });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  let body: {
    creatorId?: string | null;
    requestedCreatorName?: string;
    proofUrls?: string[];
    applicantNote?: string;
  };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (!body.requestedCreatorName?.trim()) {
    return jsonError('requestedCreatorName is required');
  }

  try {
    const row = await submitCreatorApplication({
      userId: auth.user.id,
      creatorId: body.creatorId ?? null,
      requestedCreatorName: body.requestedCreatorName,
      proofUrls: body.proofUrls,
      applicantNote: body.applicantNote,
    });
    return json({ application: serializeApplication(row) }, 201);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Failed to submit application', 400);
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const pending = await getPendingApplication(auth.user.id);
  if (!pending) return jsonError('No pending application to cancel', 404);

  try {
    const row = await cancelCreatorApplication(pending.id, auth.user.id);
    return json({ application: serializeApplication(row) });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Failed to cancel', 400);
  }
};

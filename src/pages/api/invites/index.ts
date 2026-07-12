import type { APIRoute } from 'astro';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../../../db';
import { betaInvites } from '../../../db/schema';
import { json, requireAuth } from '../../../lib/api-helpers';

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const invites = await db
    .select({ code: betaInvites.code, availableAt: betaInvites.availableAt, acceptedAt: betaInvites.acceptedAt })
    .from(betaInvites)
    .where(and(eq(betaInvites.inviterUserId, auth.user.id), isNull(betaInvites.revokedAt)))
    .orderBy(asc(betaInvites.availableAt));

  return json({ invites });
};

import type { APIRoute } from 'astro';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../../../db';
import { betaInvites } from '../../../db/schema';
import { json, jsonError, requireAuth } from '../../../lib/api-helpers';
import { createInviteForUser, getInviteCapabilityForUser } from '../../../lib/beta-invites';

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const capability = await getInviteCapabilityForUser(auth.user.id);
  const invites = await db
    .select({
      code: betaInvites.code,
      availableAt: betaInvites.availableAt,
      acceptedAt: betaInvites.acceptedAt,
      createdAt: betaInvites.createdAt,
    })
    .from(betaInvites)
    .where(and(eq(betaInvites.inviterUserId, auth.user.id), isNull(betaInvites.revokedAt)))
    .orderBy(asc(betaInvites.createdAt));

  return json({
    hasPermission: capability.hasPermission,
    canGenerateInvites: capability.canGenerate,
    generatedCount: capability.generatedCount,
    generationLimit: capability.generationLimit,
    remaining: capability.remaining,
    unlimited: capability.unlimited,
    invites,
  });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const capability = await getInviteCapabilityForUser(auth.user.id);
  if (!capability.hasPermission) {
    return jsonError('You are not allowed to generate invite codes', 403);
  }
  if (!capability.canGenerate) {
    return jsonError(
      capability.generationLimit === null
        ? 'You cannot generate more invite codes right now.'
        : `You have reached your invite limit of ${capability.generationLimit}.`,
      400,
    );
  }

  const invite = await createInviteForUser(auth.user.id);
  return json({ invite }, 201);
};

import type { APIContext } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users, creators, type Creator } from '../db/schema';
import { requireAuth, jsonError, type AuthedUser } from './api-helpers';
import { getSessionFromContext } from './session';

export function isCreatorUser(user: { role?: string | null }): boolean {
  return user.role === 'creator' || user.role === 'admin';
}

export async function requireCreator(
  context: APIContext,
): Promise<{ user: AuthedUser & { role: string } } | Response> {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const user = await db.query.users.findFirst({
    where: eq(users.id, auth.user.id),
  });

  if (!user || !isCreatorUser(user)) {
    return jsonError('Forbidden — content creator access required', 403);
  }

  return {
    user: {
      ...auth.user,
      role: user.role,
    },
  };
}

export async function getCreatorUserFromContext(context: APIContext) {
  const session = await getSessionFromContext(context);
  if (!session?.user) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!user || !isCreatorUser(user)) return null;
  return user;
}

/** The single creators-catalog entry linked to this account, if any. */
export async function getLinkedCreator(userId: string): Promise<Creator | null> {
  const linked = await db.query.creators.findFirst({
    where: eq(creators.enrolledByUserId, userId),
  });
  return linked ?? null;
}

/** True when the product is tagged with the account's linked creator. */
export function productTaggedWithCreator(
  product: { creatorIds: string[] | null },
  creatorId: string,
): boolean {
  return (product.creatorIds ?? []).includes(creatorId);
}

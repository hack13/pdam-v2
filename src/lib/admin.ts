import type { APIContext } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { requireAuth, jsonError, type AuthedUser } from './api-helpers';
import { getSessionFromContext } from './session';

export function isAdminUser(user: { role?: string | null; email: string }): boolean {
  if (user.role === 'admin') return true;

  const adminEmails = (import.meta.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(user.email.toLowerCase());
}

export async function requireAdmin(
  context: APIContext,
): Promise<{ user: AuthedUser & { role: string } } | Response> {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const user = await db.query.users.findFirst({
    where: eq(users.id, auth.user.id),
  });

  if (!user || !isAdminUser(user)) {
    return jsonError('Forbidden', 403);
  }

  return {
    user: {
      ...auth.user,
      role: user.role,
    },
  };
}

export async function getAdminUserFromContext(context: APIContext) {
  const session = await getSessionFromContext(context);
  if (!session?.user) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!user || !isAdminUser(user)) return null;

  return user;
}

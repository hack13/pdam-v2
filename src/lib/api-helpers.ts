import type { APIContext } from 'astro';
import { eq } from 'drizzle-orm';
import { auth } from '../auth';
import { db } from '../db';
import { users } from '../db/schema';
import { getSessionFromContext } from './session';

export interface AuthedUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role?: string;
  createdAt: Date;
  updatedAt: Date;
}

function extractApiKey(context: APIContext): string | null {
  const headerKey = context.request.headers.get('x-api-key');
  if (headerKey?.trim()) return headerKey.trim();

  const authorization = context.request.headers.get('authorization');
  if (authorization && /^bearer\s+/i.test(authorization)) {
    const token = authorization.replace(/^bearer\s+/i, '').trim();
    if (token) return token;
  }
  return null;
}

async function getUserFromApiKey(context: APIContext): Promise<AuthedUser | null> {
  const key = extractApiKey(context);
  if (!key) return null;

  try {
    const result = await auth.api.verifyApiKey({ body: { key } });
    if (!result.valid || !result.key) return null;

    const user = await db.query.users.findFirst({
      where: eq(users.id, result.key.referenceId),
    });
    return user ?? null;
  } catch {
    return null;
  }
}

/**
 * Authenticates a request via either a Better Auth API key
 * (`x-api-key` header or `Authorization: Bearer <key>`) or a session cookie.
 * Returns `{ user }` on success or a 401 `Response` on failure.
 */
export async function requireAuth(
  context: APIContext,
): Promise<{ user: AuthedUser } | Response> {
  const apiKeyUser = await getUserFromApiKey(context);
  if (apiKeyUser) return { user: apiKeyUser };

  const session = await getSessionFromContext(context);
  if (session?.user) {
    return { user: session.user as AuthedUser };
  }

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'untitled';
}

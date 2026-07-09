import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { requireAuth, json, jsonError } from '../../../lib/api-helpers';

function serializeUser(user: {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const user = await db.query.users.findFirst({
    where: eq(users.id, auth.user.id),
  });

  if (!user) return jsonError('Not found', 404);

  return json(serializeUser(user));
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  let body: { name?: string; image?: string | null };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  const updates: { name?: string; image?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return jsonError('Name cannot be empty');
    if (name.length > 100) return jsonError('Name too long (max 100 chars)');
    updates.name = name;
  }

  if (body.image !== undefined) {
    if (body.image === null || body.image.trim() === '') {
      updates.image = null;
    } else {
      const image = body.image.trim();
      if (!/^https?:\/\//i.test(image)) {
        return jsonError('Image must be a valid http(s) URL');
      }
      if (image.length > 500) return jsonError('Image URL too long (max 500 chars)');
      updates.image = image;
    }
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, auth.user.id))
    .returning();

  return json(serializeUser(updated));
};

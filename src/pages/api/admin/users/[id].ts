import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { users } from '../../../../db/schema';
import { requireAdmin } from '../../../../lib/admin';
import { getAdminUserSummary } from '../../../../lib/admin-stats';
import { deleteUser } from '../../../../lib/user-service';
import { json, jsonError } from '../../../../lib/api-helpers';

function serializeUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date;
  assetCount: number;
  logicalBytesUsed: number;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    assetCount: user.assetCount,
    logicalBytesUsed: user.logicalBytesUsed,
  };
}

export const GET: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (admin instanceof Response) return admin;

  const userId = context.params.id;
  if (!userId) return jsonError('User ID required', 400);

  const user = await getAdminUserSummary(userId);
  if (!user) return jsonError('User not found', 404);

  return json(serializeUser(user));
};

export const PUT: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (admin instanceof Response) return admin;

  const userId = context.params.id;
  if (!userId) return jsonError('User ID required', 400);

  const existing = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!existing) return jsonError('User not found', 404);

  let body: { name?: string; email?: string; role?: string };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  const updates: {
    name?: string;
    email?: string;
    role?: string;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return jsonError('Name cannot be empty');
    if (name.length > 100) return jsonError('Name too long (max 100 chars)');
    updates.name = name;
  }

  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase();
    if (!email) return jsonError('Email cannot be empty');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError('Invalid email address');
    }

    const emailTaken = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (emailTaken && emailTaken.id !== userId) {
      return jsonError('Email already in use');
    }
    updates.email = email;
  }

    if (body.role !== undefined) {
    if (body.role !== 'user' && body.role !== 'admin' && body.role !== 'creator') {
      return jsonError('Role must be "user", "creator", or "admin"');
    }
    updates.role = body.role;
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  const updated = await getAdminUserSummary(userId);
  if (!updated) return jsonError('User not found', 404);

  return json(serializeUser(updated));
};

export const DELETE: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (admin instanceof Response) return admin;

  const userId = context.params.id;
  if (!userId) return jsonError('User ID required', 400);

  if (userId === admin.user.id) {
    return jsonError('You cannot delete your own account', 400);
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!existing) return jsonError('User not found', 404);

  try {
    await deleteUser(userId);
    return json({ success: true });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return jsonError(
      error instanceof Error ? error.message : 'Failed to delete user',
      500,
    );
  }
};

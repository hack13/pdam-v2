import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { requireAuth, json, jsonError } from '../../../lib/api-helpers';
import { processAvatarToWebp } from '../../../lib/image';
import { storage } from '../../../lib/storage';

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const form = await context.request.formData();
  const file = form.get('avatar');

  if (!file || !(file instanceof File)) {
    return jsonError('No file uploaded');
  }

  if (!file.type.startsWith('image/')) {
    return jsonError('File must be an image');
  }

  if (file.size > 10 * 1024 * 1024) {
    return jsonError('Avatar must be under 10MB');
  }

  const data = Buffer.from(await file.arrayBuffer());

  const processed = await processAvatarToWebp(data);
  const storageKey = `avatars/${auth.user.id}.webp`;

  await storage.put(storageKey, processed.data);
  const profileImageUrl = `/api/user/avatar/${auth.user.id}`;

  const [updated] = await db
    .update(users)
    .set({ image: profileImageUrl, updatedAt: new Date() })
    .where(eq(users.id, auth.user.id))
    .returning();

  return json({
    success: true,
    image: updated.image,
    width: processed.width,
    height: processed.height,
  });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const storageKey = `avatars/${auth.user.id}.webp`;
  try {
    await storage.delete(storageKey);
  } catch {
    // ignore if file doesn't exist
  }

  const [updated] = await db
    .update(users)
    .set({ image: null, updatedAt: new Date() })
    .where(eq(users.id, auth.user.id))
    .returning();

  return json({ success: true, image: updated.image });
};

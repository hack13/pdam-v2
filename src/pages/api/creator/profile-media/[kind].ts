import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { creators } from '../../../../db/schema';
import { json, jsonError } from '../../../../lib/api-helpers';
import { getLinkedCreator, requireCreator } from '../../../../lib/creator';
import {
  isImageMimeType,
  processAvatarToWebp,
  processCreatorHeaderToWebp,
} from '../../../../lib/image';
import { storage } from '../../../../lib/storage';

type MediaKind = 'profile' | 'header';

function getKind(value: string | undefined): MediaKind | null {
  return value === 'profile' || value === 'header' ? value : null;
}

export const POST: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const kind = getKind(context.params.kind);
  if (!kind) return jsonError('Unknown profile media type', 404);

  const linked = await getLinkedCreator(auth.user.id);
  if (!linked) return jsonError('Linked creator profile not found', 404);

  const form = await context.request.formData();
  const file = form.get('image');
  if (!(file instanceof File)) return jsonError('No image uploaded');
  if (!isImageMimeType(file.type)) return jsonError('Use a JPG, PNG, GIF, WebP, AVIF, or TIFF image');
  if (file.size > 20 * 1024 * 1024) return jsonError('Image must be under 20MB');

  const source = Buffer.from(await file.arrayBuffer());
  const processed = kind === 'profile'
    ? await processAvatarToWebp(source)
    : await processCreatorHeaderToWebp(source);
  const storageKey = `creator-profiles/${linked.id}/${kind}.webp`;
  await storage.put(storageKey, processed.data);

  const mediaUrl = `/api/creator-media/${linked.id}/${kind}`;
  await db
    .update(creators)
    .set({
      ...(kind === 'profile' ? { profileImageUrl: mediaUrl } : { headerImageUrl: mediaUrl }),
      updatedAt: new Date(),
    })
    .where(and(eq(creators.id, linked.id), eq(creators.enrolledByUserId, auth.user.id)));

  return json({
    success: true,
    url: `${mediaUrl}?v=${Date.now()}`,
    width: processed.width,
    height: processed.height,
  });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const kind = getKind(context.params.kind);
  if (!kind) return jsonError('Unknown profile media type', 404);

  const linked = await getLinkedCreator(auth.user.id);
  if (!linked) return jsonError('Linked creator profile not found', 404);

  await storage.delete(`creator-profiles/${linked.id}/${kind}.webp`).catch(() => undefined);
  await db
    .update(creators)
    .set({
      ...(kind === 'profile' ? { profileImageUrl: null } : { headerImageUrl: null }),
      updatedAt: new Date(),
    })
    .where(and(eq(creators.id, linked.id), eq(creators.enrolledByUserId, auth.user.id)));

  return json({ success: true });
};

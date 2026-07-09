import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { products } from '../../../../db/schema';
import { requireAuth, json, jsonError } from '../../../../lib/api-helpers';
import { storeFile, generateAndStoreThumbnail } from '../../../../lib/file-pipeline';

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  if (!productId) return jsonError('Asset ID required');

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product || product.ownerUserId !== auth.user.id) {
    return jsonError('Not found', 404);
  }

  const form = await context.request.formData();
  const file = form.get('thumbnail');

  if (!file || !(file instanceof File)) {
    return jsonError('No file uploaded');
  }

  const mimeType = file.type;
  if (!mimeType.startsWith('image/')) {
    return jsonError('File must be an image');
  }

  if (file.size > 10 * 1024 * 1024) {
    return jsonError('Thumbnail must be under 10MB');
  }

  const data = Buffer.from(await file.arrayBuffer());
  const { blob } = await storeFile(data, file.name, mimeType);
  const thumbnail = await generateAndStoreThumbnail(blob.id, data, mimeType);

  if (!thumbnail) {
    return jsonError('Failed to generate thumbnail');
  }

  await db.update(products).set({
    thumbnailFileThumbnailId: thumbnail.id,
    updatedAt: new Date(),
  }).where(eq(products.id, productId));

  return json({ success: true, thumbnail, blob });
};

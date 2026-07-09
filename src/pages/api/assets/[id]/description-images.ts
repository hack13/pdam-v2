import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { products } from '../../../../db/schema';
import { requireAuth, json, jsonError } from '../../../../lib/api-helpers';
import { uploadDescriptionImage } from '../../../../lib/description-images';

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
  const file = form.get('image');

  if (!file || !(file instanceof File)) {
    return jsonError('No file uploaded');
  }

  try {
    const image = await uploadDescriptionImage(productId, auth.user.id, file);
    return json(image, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload image';
    if (message === 'Asset not found') {
      return jsonError('Not found', 404);
    }
    if (message.includes('product_description_images') || message.includes('does not exist')) {
      return jsonError(
        'Description images are not set up yet. Run: pnpm run db:apply-description-images',
        503,
      );
    }
    return jsonError(message, 400);
  }
};

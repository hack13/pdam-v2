import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../../lib/api-helpers';
import { getDescriptionImageData } from '../../../../../lib/description-images';

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  const imageId = context.params.imageId;

  if (!productId || !imageId) {
    return new Response('Not found', { status: 404 });
  }

  const image = await getDescriptionImageData(productId, imageId, auth.user.id);
  if (!image) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(new Uint8Array(image.data), {
    headers: {
      'Content-Type': image.mimeType,
      'Content-Length': String(image.data.length),
      // The URL is stable but access is authorized per user. Never let a
      // shared cache replay an image after the authorization check.
      'Cache-Control': 'private, no-store',
    },
  });
};

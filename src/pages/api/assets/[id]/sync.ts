import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { products } from '../../../../db/schema';
import { requireAuth, json, jsonError } from '../../../../lib/api-helpers';
import { syncLinkedCopyFromSource } from '../../../../lib/linked-copy';

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  if (!productId) return jsonError('Asset ID required');

  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.ownerUserId, auth.user.id)),
  });

  if (!product) return jsonError('Not found', 404);
  if (!product.sourceProductId) {
    return jsonError('This asset is not linked to a creator listing');
  }

  try {
    const result = await syncLinkedCopyFromSource(product.id, auth.user.id);
    return json({
      success: true,
      ...result,
      message:
        result.addedVersions > 0 || result.addedFiles > 0
          ? `Synced ${result.addedVersions} version(s) and ${result.addedFiles} file(s).`
          : 'Already up to date with the creator listing.',
    });
  } catch (err) {
    console.error('Sync failed:', err);
    return jsonError(err instanceof Error ? err.message : 'Sync failed', 500);
  }
};

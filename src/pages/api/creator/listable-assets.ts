import type { APIRoute } from 'astro';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../../db';
import { products } from '../../../db/schema';
import { requireCreator, getLinkedCreator, productTaggedWithCreator } from '../../../lib/creator';
import { json, jsonError } from '../../../lib/api-helpers';

/**
 * Assets in the creator's library that are tagged with their linked creator
 * and are eligible to be published to the gallery.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const linked = await getLinkedCreator(auth.user.id);
  if (!linked) {
    return jsonError('Link a creator profile before listing assets', 400);
  }

  const owned = await db.query.products.findMany({
    where: and(
      eq(products.ownerUserId, auth.user.id),
      sql`${products.sourceProductId} IS NULL`,
    ),
    orderBy: [desc(products.updatedAt)],
  });

  const eligible = owned
    .filter((p) => productTaggedWithCreator(p, linked.id))
    .map(({ licenseKey: _, ...rest }) => rest);

  return json({
    linkedCreator: { id: linked.id, name: linked.name, slug: linked.slug },
    assets: eligible,
  });
};

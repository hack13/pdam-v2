import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { products } from '../../../db/schema';
import { requireAuth, json } from '../../../lib/api-helpers';

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const query = context.url.searchParams.get('q')?.trim().toLowerCase() ?? '';

  const userAssets = await db.query.products.findMany({
    where: eq(products.ownerUserId, auth.user.id),
    columns: { tags: true },
  });

  const counts = new Map<string, number>();
  for (const asset of userAssets) {
    for (const tag of asset.tags ?? []) {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  let tags = [...counts.keys()];
  if (query) {
    tags = tags.filter((tag) => tag.includes(query));
  }

  tags.sort((a, b) => {
    const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });

  return json({ tags });
};

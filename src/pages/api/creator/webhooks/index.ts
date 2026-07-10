import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { creatorVerificationWebhooks, marketplaceSources } from '../../../../db/schema';
import { requireCreator } from '../../../../lib/creator';
import { generateWebhookSecret } from '../../../../lib/verification-webhook';
import { json, jsonError } from '../../../../lib/api-helpers';

function serializeWebhook(row: typeof creatorVerificationWebhooks.$inferSelect) {
  return {
    id: row.id,
    marketplaceSourceId: row.marketplaceSourceId,
    endpointUrl: row.endpointUrl,
    secret: row.secret,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const GET: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const webhooks = await db.query.creatorVerificationWebhooks.findMany({
    where: eq(creatorVerificationWebhooks.userId, auth.user.id),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  return json({ webhooks: webhooks.map(serializeWebhook) });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  let body: {
    endpointUrl?: string;
    marketplaceSourceId?: string | null;
    secret?: string;
  };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (!body.endpointUrl?.trim()) return jsonError('endpointUrl is required');
  try {
    const url = new URL(body.endpointUrl.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return jsonError('endpointUrl must be http or https');
    }
  } catch {
    return jsonError('endpointUrl must be a valid URL');
  }

  if (body.marketplaceSourceId) {
    const marketplace = await db.query.marketplaceSources.findFirst({
      where: eq(marketplaceSources.id, body.marketplaceSourceId),
    });
    if (!marketplace) return jsonError('Marketplace not found');
  }

  const secret = body.secret?.trim() || generateWebhookSecret();

  const [row] = await db
    .insert(creatorVerificationWebhooks)
    .values({
      userId: auth.user.id,
      endpointUrl: body.endpointUrl.trim(),
      marketplaceSourceId: body.marketplaceSourceId || null,
      secret,
      isActive: true,
    })
    .returning();

  return json(serializeWebhook(row), 201);
};

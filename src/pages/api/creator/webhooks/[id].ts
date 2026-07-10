import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db';
import { creatorVerificationWebhooks, marketplaceSources } from '../../../../db/schema';
import { requireCreator } from '../../../../lib/creator';
import { generateWebhookSecret, validateWebhookEndpoint } from '../../../../lib/verification-webhook';
import { decryptWebhookSecret, encryptWebhookSecret } from '../../../../lib/webhook-secrets';
import { json, jsonError } from '../../../../lib/api-helpers';

export const PUT: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const webhookId = context.params.id;
  if (!webhookId) return jsonError('Webhook ID required');

  const existing = await db.query.creatorVerificationWebhooks.findFirst({
    where: and(
      eq(creatorVerificationWebhooks.id, webhookId),
      eq(creatorVerificationWebhooks.userId, auth.user.id),
    ),
  });
  if (!existing) return jsonError('Webhook not found', 404);

  let body: {
    endpointUrl?: string;
    marketplaceSourceId?: string | null;
    isActive?: boolean;
    rotateSecret?: boolean;
  };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  const updates: {
    endpointUrl?: string;
    marketplaceSourceId?: string | null;
    isActive?: boolean;
    secret?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (body.endpointUrl !== undefined) {
    const trimmed = body.endpointUrl.trim();
    if (!trimmed) return jsonError('endpointUrl cannot be empty');
    let endpointUrl: URL;
    try {
      endpointUrl = await validateWebhookEndpoint(trimmed);
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : 'endpointUrl is not allowed');
    }
    updates.endpointUrl = endpointUrl.toString();
  }

  if (body.marketplaceSourceId !== undefined) {
    if (body.marketplaceSourceId) {
      const marketplace = await db.query.marketplaceSources.findFirst({
        where: eq(marketplaceSources.id, body.marketplaceSourceId),
      });
      if (!marketplace) return jsonError('Marketplace not found');
    }
    updates.marketplaceSourceId = body.marketplaceSourceId || null;
  }

  if (body.isActive !== undefined) {
    updates.isActive = Boolean(body.isActive);
  }

  if (body.rotateSecret) {
    updates.secret = encryptWebhookSecret(generateWebhookSecret());
  }

  const [row] = await db
    .update(creatorVerificationWebhooks)
    .set(updates)
    .where(eq(creatorVerificationWebhooks.id, webhookId))
    .returning();

  return json({
    id: row.id,
    marketplaceSourceId: row.marketplaceSourceId,
    endpointUrl: row.endpointUrl,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(body.rotateSecret ? { secret: decryptWebhookSecret(row.secret) } : {}),
  });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireCreator(context);
  if (auth instanceof Response) return auth;

  const webhookId = context.params.id;
  if (!webhookId) return jsonError('Webhook ID required');

  const existing = await db.query.creatorVerificationWebhooks.findFirst({
    where: and(
      eq(creatorVerificationWebhooks.id, webhookId),
      eq(creatorVerificationWebhooks.userId, auth.user.id),
    ),
  });
  if (!existing) return jsonError('Webhook not found', 404);

  await db
    .delete(creatorVerificationWebhooks)
    .where(eq(creatorVerificationWebhooks.id, webhookId));

  return json({ success: true });
};

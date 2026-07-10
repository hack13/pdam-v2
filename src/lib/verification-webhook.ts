import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { creatorVerificationWebhooks, marketplaceSources, products } from '../db/schema';

export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

export function signWebhookPayload(secret: string, body: string, timestamp: string): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
}

export function verifyWebhookSignature(
  secret: string,
  body: string,
  timestamp: string,
  signature: string,
): boolean {
  const expected = signWebhookPayload(secret, body, timestamp);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function resolveCreatorWebhook(
  creatorUserId: string,
  marketplaceSourceId: string,
) {
  const specific = await db.query.creatorVerificationWebhooks.findFirst({
    where: and(
      eq(creatorVerificationWebhooks.userId, creatorUserId),
      eq(creatorVerificationWebhooks.marketplaceSourceId, marketplaceSourceId),
      eq(creatorVerificationWebhooks.isActive, true),
    ),
  });
  if (specific) return specific;

  return db.query.creatorVerificationWebhooks.findFirst({
    where: and(
      eq(creatorVerificationWebhooks.userId, creatorUserId),
      isNull(creatorVerificationWebhooks.marketplaceSourceId),
      eq(creatorVerificationWebhooks.isActive, true),
    ),
  });
}

export interface VerificationWebhookResult {
  verified: boolean;
  reason?: string;
  externalPurchaseId?: string;
}

/**
 * POSTs a license verification request to the creator's webhook.
 * Expected response JSON: `{ "verified": boolean, "reason"?: string, "externalPurchaseId"?: string }`
 */
export async function callVerificationWebhook(params: {
  endpointUrl: string;
  secret: string;
  productId: string;
  productTitle: string;
  marketplaceSourceId: string;
  marketplaceSlug: string | null;
  marketplaceName: string | null;
  licenseKey: string;
  userId: string;
  userEmail: string;
}): Promise<VerificationWebhookResult> {
  const payload = {
    event: 'license.verify',
    productId: params.productId,
    productTitle: params.productTitle,
    marketplaceSourceId: params.marketplaceSourceId,
    marketplaceSlug: params.marketplaceSlug,
    marketplaceName: params.marketplaceName,
    licenseKey: params.licenseKey,
    userId: params.userId,
    userEmail: params.userEmail,
  };

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signWebhookPayload(params.secret, body, timestamp);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(params.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PDAM-Timestamp': timestamp,
        'X-PDAM-Signature': signature,
        'User-Agent': 'PDAM-License-Verify/1.0',
      },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        verified: false,
        reason: `Verification endpoint returned HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as {
      verified?: boolean;
      reason?: string;
      externalPurchaseId?: string;
    };

    return {
      verified: Boolean(data.verified),
      reason: data.reason,
      externalPurchaseId: data.externalPurchaseId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook request failed';
    return { verified: false, reason: message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getMarketplaceMeta(marketplaceSourceId: string) {
  return db.query.marketplaceSources.findFirst({
    where: eq(marketplaceSources.id, marketplaceSourceId),
  });
}

export async function getGalleryListingOwner(productId: string) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });
  if (!product?.isGalleryListed || !product.ownerUserId) return null;
  return product;
}

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db';
import {
  products,
  galleryPurchaseLinks,
  ownershipVerifications,
} from '../../../../db/schema';
import { requireAuth, json, jsonError } from '../../../../lib/api-helpers';
import {
  callVerificationWebhook,
  getMarketplaceMeta,
  resolveCreatorWebhook,
} from '../../../../lib/verification-webhook';
import { decryptWebhookSecret } from '../../../../lib/webhook-secrets';
import {
  checkVerificationRateLimit,
  clearVerificationRateLimit,
} from '../../../../lib/verification-rate-limit';
import {
  createLinkedCopy,
  recordVerifiedOwnership,
} from '../../../../lib/linked-copy';
import { fingerprintLicenseKey } from '../../../../lib/license-key-fingerprint';

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const productId = context.params.id;
  if (!productId) return jsonError('Listing ID required');

  let body: { marketplaceSourceId?: string; licenseKey?: string };
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  if (!body.marketplaceSourceId) return jsonError('Marketplace is required');
  if (!body.licenseKey?.trim()) return jsonError('License key is required');

  const listing = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.isGalleryListed, true)),
  });
  if (!listing || !listing.ownerUserId) {
    return jsonError('Listing not found', 404);
  }

  if (listing.ownerUserId === auth.user.id) {
    return jsonError('You cannot claim ownership of your own listing');
  }

  const existingLinked = await db.query.products.findFirst({
    where: and(
      eq(products.ownerUserId, auth.user.id),
      eq(products.sourceProductId, productId),
    ),
  });
  if (existingLinked) {
    return jsonError('You already have this asset in your library', 409);
  }

  const purchaseLink = await db.query.galleryPurchaseLinks.findFirst({
    where: and(
      eq(galleryPurchaseLinks.productId, productId),
      eq(galleryPurchaseLinks.marketplaceSourceId, body.marketplaceSourceId),
    ),
  });
  if (!purchaseLink) {
    return jsonError('Selected marketplace is not available for this listing');
  }

  const marketplace = await getMarketplaceMeta(body.marketplaceSourceId);
  if (!marketplace) return jsonError('Marketplace not found');

  const webhook = await resolveCreatorWebhook(listing.ownerUserId, body.marketplaceSourceId);
  if (!webhook) {
    return jsonError(
      'This creator has not configured license verification yet. Try again later.',
      503,
    );
  }

  const rateLimit = await checkVerificationRateLimit(
    context,
    auth.user.id,
    productId,
    body.marketplaceSourceId,
  );
  if (!rateLimit.allowed) {
    const response = jsonError('Too many verification attempts. Please try again later.', 429);
    if (rateLimit.retryAfterSeconds) response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
    return response;
  }

  const licenseKey = body.licenseKey.trim();
  const licenseKeyFingerprint = fingerprintLicenseKey(licenseKey);
  const now = new Date();

  const existingAttempt = await db.query.ownershipVerifications.findFirst({
    where: and(
      eq(ownershipVerifications.userId, auth.user.id),
      eq(ownershipVerifications.productId, productId),
    ),
  });

  if (existingAttempt?.status === 'verified' && existingAttempt.linkedProductId) {
    return json({
      verified: true,
      linkedProductId: existingAttempt.linkedProductId,
      message: 'Already verified',
    });
  }

  const result = await callVerificationWebhook({
    endpointUrl: webhook.endpointUrl,
    secret: decryptWebhookSecret(webhook.secret),
    productId: listing.id,
    productTitle: listing.title,
    marketplaceSourceId: body.marketplaceSourceId,
    marketplaceSlug: marketplace.slug,
    marketplaceName: marketplace.name,
    licenseKey,
  });

  if (!result.verified) {
    if (existingAttempt) {
      await db
        .update(ownershipVerifications)
        .set({
          marketplaceSourceId: body.marketplaceSourceId,
          licenseKey: licenseKeyFingerprint,
          status: 'failed',
          failureReason: result.reason ?? 'License could not be verified',
          updatedAt: now,
        })
        .where(eq(ownershipVerifications.id, existingAttempt.id));
    } else {
      await db.insert(ownershipVerifications).values({
        userId: auth.user.id,
        productId,
        marketplaceSourceId: body.marketplaceSourceId,
        licenseKey: licenseKeyFingerprint,
        status: 'failed',
        failureReason: result.reason ?? 'License could not be verified',
      });
    }

    return jsonError('License key could not be verified', 403);
  }

  try {
    const { linkedProductId } = await createLinkedCopy({
      sourceProductId: productId,
      buyerUserId: auth.user.id,
      marketplaceSourceId: body.marketplaceSourceId,
      licenseKey,
      externalPurchaseId: result.externalPurchaseId ?? null,
    });

    await recordVerifiedOwnership({
      userId: auth.user.id,
      productId,
      marketplaceSourceId: body.marketplaceSourceId,
      licenseKey,
      linkedProductId,
      externalPurchaseId: result.externalPurchaseId ?? null,
    });

    await clearVerificationRateLimit(
      auth.user.id,
      productId,
      body.marketplaceSourceId,
    );

    return json({
      verified: true,
      linkedProductId,
      message: 'Ownership verified. The asset has been added to your library.',
    });
  } catch (err) {
    console.error('Failed to create linked copy:', err);
    return jsonError(
      err instanceof Error ? err.message : 'Failed to add asset to library',
      500,
    );
  }
};

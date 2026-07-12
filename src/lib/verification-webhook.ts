import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { creatorVerificationWebhooks, marketplaceSources, products } from '../db/schema';

export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

function isBlockedIpv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0)
    || a >= 224;
}

function ipv6Bytes(address: string): number[] | null {
  const input = address.toLowerCase();
  const [left, right] = input.split('::');
  if (input.split('::').length > 2) return null;

  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];
  const parts = [...leftParts, ...rightParts];
  if (parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part)) || parts.length > 8) return null;

  const expanded = input.includes('::')
    ? [...leftParts, ...Array(8 - parts.length).fill('0'), ...rightParts]
    : parts;
  if (expanded.length !== 8) return null;

  return expanded.flatMap((part) => {
    const value = Number.parseInt(part, 16);
    return [value >> 8, value & 0xff];
  });
}

function isBlockedIpv6(address: string): boolean {
  if (address.includes('.')) {
    const mappedIpv4 = address.slice(address.lastIndexOf(':') + 1);
    return isBlockedIpv4(mappedIpv4);
  }

  const bytes = ipv6Bytes(address);
  if (!bytes) return true;

  const isUnspecified = bytes.every((byte) => byte === 0);
  const isLoopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  const isIpv4Mapped = bytes.slice(0, 10).every((byte) => byte === 0)
    && bytes[10] === 0xff && bytes[11] === 0xff;
  const isIpv4Compatible = bytes.slice(0, 12).every((byte) => byte === 0);
  if (isUnspecified || isLoopback) return true;
  if (isIpv4Mapped || isIpv4Compatible) {
    return isBlockedIpv4(bytes.slice(12).join('.'));
  }

  const isUniqueLocal = (bytes[0] & 0xfe) === 0xfc;
  const isLinkLocal = bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80;
  const isDocumentation = bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8;
  const isBenchmarking = bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x02;
  const isMulticast = bytes[0] === 0xff;
  return isUniqueLocal || isLinkLocal || isDocumentation || isBenchmarking || isMulticast;
}

function isBlockedIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

interface ValidatedWebhookEndpoint {
  url: URL;
  addresses: { address: string; family: number }[];
}

/** Resolves a webhook host and rejects non-public addresses before any connection is made. */
async function resolveWebhookEndpoint(endpointUrl: string): Promise<ValidatedWebhookEndpoint> {
  let url: URL;
  try {
    url = new URL(endpointUrl.trim());
  } catch {
    throw new Error('endpointUrl must be a valid HTTPS URL');
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('endpointUrl must be an HTTPS URL without credentials');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('endpointUrl host could not be resolved');
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIp(address))) {
    throw new Error('endpointUrl must resolve only to public IP addresses');
  }

  return { url, addresses };
}

/** Validates that a webhook can only target publicly routable HTTPS hosts. */
export async function validateWebhookEndpoint(endpointUrl: string): Promise<URL> {
  return (await resolveWebhookEndpoint(endpointUrl)).url;
}

async function postVerificationWebhook(
  endpoint: ValidatedWebhookEndpoint,
  body: string,
  timestamp: string,
  signature: string,
  signal: AbortSignal,
): Promise<{ status: number; body: string }> {
  const address = endpoint.addresses[0];

  return new Promise((resolve, reject) => {
    // Pin the connection to the address just validated. This prevents DNS
    // rebinding between validation and the HTTPS connection.
    const request = httpsRequest(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-PDAM-Timestamp': timestamp,
        'X-PDAM-Signature': signature,
        'User-Agent': 'PDAM-License-Verify/1.0',
      },
      lookup: (_hostname, options, callback) => {
        // Node 22 may request all resolved addresses for automatic family
        // selection. Match the callback shape it asks for while still pinning
        // the connection to an address we have already validated.
        if (options.all) return callback(null, [address]);
        return callback(null, address.address, address.family);
      },
      signal,
    }, (response) => {
      const chunks: Buffer[] = [];
      let responseSize = 0;

      response.on('data', (chunk: Buffer) => {
        responseSize += chunk.length;
        if (responseSize > 64 * 1024) {
          request.destroy(new Error('Verification endpoint response is too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });
      });
      response.on('error', reject);
    });

    request.on('error', reject);
    request.end(body);
  });
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
  productTitle: string;
  marketplaceProductId: string;
  marketplaceSlug: string | null;
  licenseKey: string;
  userId: string;
}): Promise<VerificationWebhookResult> {
  let endpoint: ValidatedWebhookEndpoint;
  try {
    // Revalidate at delivery time to protect existing records and DNS changes.
    endpoint = await resolveWebhookEndpoint(params.endpointUrl);
  } catch (err) {
    return {
      verified: false,
      reason: err instanceof Error ? err.message : 'Webhook endpoint is not allowed',
    };
  }

  const payload = {
    event: 'license.verify',
    productTitle: params.productTitle,
    marketplaceSlug: params.marketplaceSlug,
    licenseKey: params.licenseKey,
    userId: params.userId,
    marketplaceProductId: params.marketplaceProductId,
  };

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signWebhookPayload(params.secret, body, timestamp);

  const runtimeEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
  if (runtimeEnv?.DEV) {
    console.info('[license-verification] Raw webhook request', {
      url: endpoint.url.toString(),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-PDAM-Timestamp': timestamp,
        'X-PDAM-Signature': signature,
        'User-Agent': 'PDAM-License-Verify/1.0',
      },
      body,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await postVerificationWebhook(endpoint, body, timestamp, signature, controller.signal);

    // node:https never follows redirects, so a redirect cannot reach a
    // different host or an internal address.
    if (response.status >= 300 && response.status < 400) {
      return { verified: false, reason: 'Verification endpoint must not redirect' };
    }

    if (response.status < 200 || response.status >= 300) {
      return {
        verified: false,
        reason: `Verification endpoint returned HTTP ${response.status}`,
      };
    }

    const data = JSON.parse(response.body) as {
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

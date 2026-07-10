import { createHash } from 'node:crypto';
import type { APIContext } from 'astro';
import { sql } from 'drizzle-orm';
import { db } from '../db';

const IP_WINDOW_SECONDS = 15 * 60;
const IP_MAX_ATTEMPTS = 20;
const INITIAL_BACKOFF_SECONDS = 30;
const MAX_BACKOFF_SECONDS = 60 * 60;

export interface VerificationRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

function clientAddress(context: APIContext): string {
  if (context.clientAddress) return context.clientAddress;
  const realIp = context.request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  // Only honor forwarded addresses when the deployment explicitly trusts its proxy.
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }

  return 'unknown';
}

function hashAddress(address: string): string {
  const salt = process.env.BETTER_AUTH_SECRET ?? process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ?? 'pdam-rate-limit';
  return createHash('sha256').update(`${salt}:${address}`).digest('hex');
}

function secondsUntil(date: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
}

async function checkIpLimit(ipHash: string): Promise<VerificationRateLimitResult> {
  const rows = await db.execute<{ request_count: number; window_started_at: Date }>(sql`
    INSERT INTO verification_ip_rate_limits (ip_hash, window_started_at, request_count, updated_at)
    VALUES (${ipHash}, NOW(), 1, NOW())
    ON CONFLICT (ip_hash) DO UPDATE SET
      request_count = CASE
        WHEN verification_ip_rate_limits.window_started_at <= NOW() - INTERVAL '15 minutes' THEN 1
        ELSE verification_ip_rate_limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN verification_ip_rate_limits.window_started_at <= NOW() - INTERVAL '15 minutes' THEN NOW()
        ELSE verification_ip_rate_limits.window_started_at
      END,
      updated_at = NOW()
    RETURNING request_count, window_started_at
  `);

  const row = rows[0];
  if (!row || row.request_count <= IP_MAX_ATTEMPTS) return { allowed: true };

  const retryAt = new Date(row.window_started_at.getTime() + IP_WINDOW_SECONDS * 1000);
  return { allowed: false, retryAfterSeconds: secondsUntil(retryAt) };
}

async function checkSubjectLimit(
  userId: string,
  productId: string,
  marketplaceSourceId: string,
): Promise<VerificationRateLimitResult> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{
      attempt_count: number;
      next_allowed_at: Date;
    }>(sql`
      SELECT attempt_count, next_allowed_at
      FROM verification_rate_limits
      WHERE user_id = ${userId}
        AND product_id = ${productId}
        AND marketplace_source_id = ${marketplaceSourceId}
      FOR UPDATE
    `);

    const existing = rows[0];
    if (existing && existing.next_allowed_at > new Date()) {
      return {
        allowed: false,
        retryAfterSeconds: secondsUntil(existing.next_allowed_at),
      };
    }

    const attemptCount = existing ? existing.attempt_count + 1 : 1;
    const backoffSeconds = Math.min(
      MAX_BACKOFF_SECONDS,
      INITIAL_BACKOFF_SECONDS * (2 ** Math.max(0, attemptCount - 1)),
    );
    const nextAllowedAt = new Date(Date.now() + backoffSeconds * 1000);

    await tx.execute(sql`
      INSERT INTO verification_rate_limits (
        user_id, product_id, marketplace_source_id, attempt_count, next_allowed_at, updated_at
      ) VALUES (
        ${userId}, ${productId}, ${marketplaceSourceId}, ${attemptCount}, ${nextAllowedAt}, NOW()
      )
      ON CONFLICT (user_id, product_id, marketplace_source_id) DO UPDATE SET
        attempt_count = ${attemptCount},
        next_allowed_at = ${nextAllowedAt},
        updated_at = NOW()
    `);

    return { allowed: true };
  });
}

export async function checkVerificationRateLimit(
  context: APIContext,
  userId: string,
  productId: string,
  marketplaceSourceId: string,
): Promise<VerificationRateLimitResult> {
  const ipResult = await checkIpLimit(hashAddress(clientAddress(context)));
  if (!ipResult.allowed) return ipResult;
  return checkSubjectLimit(userId, productId, marketplaceSourceId);
}

/** Clear the subject backoff after a successful verification. */
export async function clearVerificationRateLimit(
  userId: string,
  productId: string,
  marketplaceSourceId: string,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM verification_rate_limits
    WHERE user_id = ${userId}
      AND product_id = ${productId}
      AND marketplace_source_id = ${marketplaceSourceId}
  `);
}

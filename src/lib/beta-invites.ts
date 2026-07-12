import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from '../db';
import { betaInvites } from '../db/schema';

export const REFERRAL_COUNT = 3;
export const REFERRAL_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

function createInviteCode() {
  // URL-safe and long enough that codes cannot be feasibly guessed.
  return randomBytes(24).toString('base64url');
}

export async function scheduleReferralsForUser(userId: string, joinedAt = new Date()) {
  const rows = Array.from({ length: REFERRAL_COUNT }, (_, index) => ({
    id: randomUUID(),
    code: createInviteCode(),
    inviterUserId: userId,
    availableAt: new Date(joinedAt.getTime() + REFERRAL_INTERVAL_MS * (index + 1)),
  }));

  await db.insert(betaInvites).values(rows).onConflictDoNothing();
}

/** Atomically spends a currently available code before Better Auth creates the user. */
export async function acceptInviteForEmail(code: string | null, email: string) {
  if (!code || code.length > 200) return false;

  const [invite] = await db
    .update(betaInvites)
    .set({ acceptedAt: new Date(), acceptedByEmail: email.toLowerCase() })
    .where(and(
      eq(betaInvites.code, code),
      isNull(betaInvites.acceptedAt),
      isNull(betaInvites.revokedAt),
      lte(betaInvites.availableAt, new Date()),
    ))
    .returning({ id: betaInvites.id });

  return !!invite;
}

export async function attachAcceptedInviteToUser(userId: string, email: string, joinedAt: Date) {
  const [invite] = await db
    .update(betaInvites)
    .set({ acceptedByUserId: userId })
    .where(and(eq(betaInvites.acceptedByEmail, email.toLowerCase()), isNull(betaInvites.acceptedByUserId)))
    .returning({ id: betaInvites.id });

  if (invite) await scheduleReferralsForUser(userId, joinedAt);
}

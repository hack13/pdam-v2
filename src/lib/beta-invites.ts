import { randomBytes, randomUUID } from 'node:crypto';
import { and, count, eq, isNull, lte } from 'drizzle-orm';
import { db } from '../db';
import { betaInvites, users } from '../db/schema';
import { isAdminUser } from './admin';

function createInviteCode() {
  // URL-safe and long enough that codes cannot be feasibly guessed.
  return randomBytes(24).toString('base64url');
}

export function userCanGenerateInvites(user: {
  role?: string | null;
  email: string;
  canGenerateInvites?: boolean | null;
}) {
  return !!user.canGenerateInvites || isAdminUser(user);
}

/** Creates one immediately usable invite owned by the given user. */
export async function createInviteForUser(userId: string) {
  const [invite] = await db
    .insert(betaInvites)
    .values({
      id: randomUUID(),
      code: createInviteCode(),
      inviterUserId: userId,
      availableAt: new Date(),
    })
    .returning({
      code: betaInvites.code,
      availableAt: betaInvites.availableAt,
      acceptedAt: betaInvites.acceptedAt,
      createdAt: betaInvites.createdAt,
    });

  return invite;
}

/** Non-revoked invites count toward the user's lifetime generation budget. */
export async function countGeneratedInvitesForUser(userId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(betaInvites)
    .where(and(eq(betaInvites.inviterUserId, userId), isNull(betaInvites.revokedAt)));

  return row?.value ?? 0;
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

export async function attachAcceptedInviteToUser(userId: string, email: string) {
  await db
    .update(betaInvites)
    .set({ acceptedByUserId: userId })
    .where(and(eq(betaInvites.acceptedByEmail, email.toLowerCase()), isNull(betaInvites.acceptedByUserId)));
}

export async function getInviteCapabilityForUser(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) {
    return {
      hasPermission: false,
      canGenerate: false,
      generatedCount: 0,
      generationLimit: 0 as number | null,
      remaining: 0 as number | null,
      unlimited: false,
    };
  }

  const generatedCount = await countGeneratedInvitesForUser(userId);
  const unlimited = isAdminUser(user);
  const hasPermission = userCanGenerateInvites(user);
  const generationLimit = unlimited ? null : user.inviteGenerationLimit;
  const remaining = unlimited
    ? null
    : Math.max(0, user.inviteGenerationLimit - generatedCount);
  const canGenerate = hasPermission
    && (unlimited || (user.inviteGenerationLimit > 0 && (remaining ?? 0) > 0));

  return {
    hasPermission,
    canGenerate,
    generatedCount,
    generationLimit,
    remaining,
    unlimited,
  };
}

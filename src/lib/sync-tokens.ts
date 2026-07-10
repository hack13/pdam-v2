import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { syncTokens } from '../db/schema';

export const SYNC_SCOPES = ['sync:manifest', 'sync:read', 'sync:export'] as const;
export type SyncScope = (typeof SYNC_SCOPES)[number];

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSyncToken(params: {
  userId: string;
  name: string;
  expiresAt?: Date | null;
  scopes?: SyncScope[];
  clientMetadata?: string | null;
}) {
  const raw = `pdam_sync_${randomBytes( thirtyTwoBytes()).toString('base64url')}`;
  const [row] = await db.insert(syncTokens).values({
    userId: params.userId,
    tokenHash: hashToken(raw),
    tokenPrefix: raw.slice(0, 18),
    name: params.name,
    scopes: (params.scopes?.length ? params.scopes : [...SYNC_SCOPES]).join(','),
    expiresAt: params.expiresAt ?? null,
    clientMetadata: params.clientMetadata ?? null,
  }).returning();
  return { row, token: raw };
}

function thirtyTwoBytes() { return 32; }

export async function authenticateSyncToken(raw: string, requiredScope: SyncScope) {
  const row = await db.query.syncTokens.findFirst({
    where: and(eq(syncTokens.tokenHash, hashToken(raw)), isNull(syncTokens.revokedAt)),
  });
  if (!row || (row.expiresAt && row.expiresAt <= new Date())) return null;
  if (!row.scopes.split(',').includes(requiredScope)) return null;

  await db.update(syncTokens).set({ lastUsedAt: new Date() }).where(eq(syncTokens.id, row.id));
  return row;
}

export async function revokeSyncToken(userId: string, tokenId: string) {
  await db.update(syncTokens).set({ revokedAt: new Date() })
    .where(and(eq(syncTokens.id, tokenId), eq(syncTokens.userId, userId)));
}

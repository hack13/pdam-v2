import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { syncRunFailures } from '../db/schema';

export type SyncFailureDiagnostic = {
  runId: string;
  userId: string;
  itemKind: 'file' | 'thumbnail' | 'metadata';
  itemName: string;
  destinationKey: string;
  errorMessage: string;
  failureCode: string;
  httpStatus: number | null;
  retryable: boolean;
};

/**
 * Keep one user-facing diagnostic per object and run. Queue retries update this
 * record instead of losing the original failure in sync_items' transfer state.
 */
export async function recordSyncFailure(diagnostic: SyncFailureDiagnostic) {
  const now = new Date();
  await db.insert(syncRunFailures).values({
    ...diagnostic,
    httpStatus: diagnostic.httpStatus ?? null,
    status: 'failed',
    attemptCount: 1,
    firstFailedAt: now,
    lastFailedAt: now,
    resolvedAt: null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [syncRunFailures.runId, syncRunFailures.destinationKey],
    set: {
      itemKind: diagnostic.itemKind,
      itemName: diagnostic.itemName,
      errorMessage: diagnostic.errorMessage,
      failureCode: diagnostic.failureCode,
      httpStatus: diagnostic.httpStatus ?? null,
      retryable: diagnostic.retryable,
      status: 'failed',
      attemptCount: sql`${syncRunFailures.attemptCount} + 1`,
      lastFailedAt: now,
      resolvedAt: null,
      updatedAt: now,
    },
  });
}

export async function resolveSyncFailure(runId: string, destinationKey: string) {
  const now = new Date();
  await db.update(syncRunFailures)
    .set({ status: 'recovered', resolvedAt: now, updatedAt: now })
    .where(and(
      eq(syncRunFailures.runId, runId),
      eq(syncRunFailures.destinationKey, destinationKey),
      eq(syncRunFailures.status, 'failed'),
    ));
}

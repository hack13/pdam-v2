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

let diagnosticsTableUnavailable = false;

function isMissingDiagnosticsTable(error: unknown) {
  const details = error as { code?: string; cause?: { code?: string; message?: string }; message?: string };
  return details.code === '42P01'
    || details.cause?.code === '42P01'
    || details.message?.includes('relation "sync_run_failures" does not exist')
    || details.cause?.message?.includes('relation "sync_run_failures" does not exist');
}

function disableDiagnosticsForMissingTable(error: unknown) {
  if (!isMissingDiagnosticsTable(error) || diagnosticsTableUnavailable) return false;
  diagnosticsTableUnavailable = true;
  console.warn('[sync-diagnostics] sync_run_failures is unavailable; diagnostics are paused until migration 0018_sync_run_failures runs');
  return true;
}

/**
 * Keep one user-facing diagnostic per object and run. Queue retries update this
 * record instead of losing the original failure in sync_items' transfer state.
 */
export async function recordSyncFailure(diagnostic: SyncFailureDiagnostic) {
  if (diagnosticsTableUnavailable) return false;
  const now = new Date();
  try {
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
    return true;
  } catch (error) {
    // Diagnostics must never turn a recoverable backup failure into a failed
    // sync. This also keeps syncs operating while a deployment is waiting for
    // the accompanying database migration.
    if (!disableDiagnosticsForMissingTable(error)) console.error('[sync-diagnostics] could not record failure', { runId: diagnostic.runId, destinationKey: diagnostic.destinationKey, error });
    return false;
  }
}

export async function resolveSyncFailure(runId: string, destinationKey: string) {
  if (diagnosticsTableUnavailable) return false;
  const now = new Date();
  try {
    await db.update(syncRunFailures)
      .set({ status: 'recovered', resolvedAt: now, updatedAt: now })
      .where(and(
        eq(syncRunFailures.runId, runId),
        eq(syncRunFailures.destinationKey, destinationKey),
        eq(syncRunFailures.status, 'failed'),
      ));
    return true;
  } catch (error) {
    if (!disableDiagnosticsForMissingTable(error)) console.error('[sync-diagnostics] could not resolve failure', { runId, destinationKey, error });
    return false;
  }
}

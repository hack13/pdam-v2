import { beforeEach, describe, expect, it, vi } from 'vitest';

const onConflictDoUpdate = vi.fn();
const values = vi.fn(() => ({ onConflictDoUpdate }));
const insert = vi.fn(() => ({ values }));
const where = vi.fn();
const set = vi.fn(() => ({ where }));
const update = vi.fn(() => ({ set }));

vi.mock('../db', () => ({ db: { insert, update } }));

const { recordSyncFailure, resolveSyncFailure } = await import('./sync-diagnostics');

describe('sync failure diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onConflictDoUpdate.mockResolvedValue(undefined);
    where.mockResolvedValue(undefined);
  });

  it('groups repeated failures for one run and destination into an upserted record', async () => {
    const diagnostic = {
      runId: 'run-1', userId: 'user-1', itemKind: 'file' as const, itemName: 'guide.pdf',
      destinationKey: 'assets/neon/v1/guide.pdf', errorMessage: 'Destination access was denied',
      failureCode: 'DESTINATION_FORBIDDEN', httpStatus: 403, retryable: false,
    };

    await recordSyncFailure(diagnostic);
    await recordSyncFailure(diagnostic);

    expect(insert).toHaveBeenCalledTimes(2);
    expect(values).toHaveBeenCalledTimes(2);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(2);
    expect(onConflictDoUpdate.mock.calls[1][0].set).toMatchObject({
      itemName: 'guide.pdf',
      status: 'failed',
      resolvedAt: null,
    });
  });

  it('marks a later successful retry as recovered without deleting the diagnostic', async () => {
    await resolveSyncFailure('run-1', 'assets/neon/v1/guide.pdf');

    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'recovered' }));
    expect(where).toHaveBeenCalledTimes(1);
  });
});

import { client } from '../db';

export const SYNC_PROGRESS_CHANNEL = 'pdam_sync_progress';

export async function notifySyncRunChanged(runId: string) {
  try {
    await client.notify(SYNC_PROGRESS_CHANNEL, runId);
  } catch (error) {
    console.error('[sync-events] could not notify run progress', { runId, error });
  }
}

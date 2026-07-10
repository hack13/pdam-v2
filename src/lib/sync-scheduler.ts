import { and, eq, isNull, or, lt } from 'drizzle-orm';
import { db } from '../db';
import { userStorageConnections } from '../db/schema';
import { enqueueConnectionSync } from './sync-queue';

type ScheduledConnection = typeof userStorageConnections.$inferSelect;

function localScheduleParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { dateKey: new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC' }).format(date), hour: get('hour'), minute: get('minute'), weekday };
}

export function isScheduledNow(connection: ScheduledConnection, now = new Date()) {
  if (!connection.enabled || !connection.scheduleEnabled || !connection.scheduleFrequency || !connection.scheduleTime) return false;
  const [hour, minute] = connection.scheduleTime.split(':');
  if (!/^\d{2}:\d{2}$/.test(connection.scheduleTime)) return false;
  const local = localScheduleParts(now, connection.scheduleTimezone);
  if (local.hour !== hour || local.minute !== minute) return false;
  if (connection.scheduleFrequency === 'weekly' && local.weekday !== connection.scheduleDayOfWeek) return false;
  const last = connection.lastScheduledAt ? localScheduleParts(connection.lastScheduledAt, connection.scheduleTimezone) : null;
  return !last || last.dateKey !== local.dateKey;
}

export async function enqueueDueScheduledConnections(now = new Date(), limit = 100) {
  const connections = await db.query.userStorageConnections.findMany({
    where: and(eq(userStorageConnections.enabled, true), eq(userStorageConnections.scheduleEnabled, true), or(isNull(userStorageConnections.lastScheduledAt), lt(userStorageConnections.lastScheduledAt, new Date(now.getTime() - 60_000)))),
    limit,
  });
  const results = [];
  for (const connection of connections) {
    if (!isScheduledNow(connection, now)) continue;
    try {
      const queued = await enqueueConnectionSync(connection.id, connection.userId);
      await db.update(userStorageConnections).set({ lastScheduledAt: now, updatedAt: now }).where(eq(userStorageConnections.id, connection.id));
      results.push({ connectionId: connection.id, ...queued });
    } catch (error) {
      results.push({ connectionId: connection.id, status: 'failed', error: error instanceof Error ? error.message : 'Could not queue scheduled sync' });
    }
  }
  return results;
}

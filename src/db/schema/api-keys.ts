import { pgTable, text, timestamp, bigint, boolean, index } from 'drizzle-orm/pg-core';

export const apikey = pgTable('apikey', {
  id: text('id').primaryKey(),
  configId: text('config_id').notNull().default('default'),
  name: text('name'),
  start: text('start'),
  referenceId: text('reference_id').notNull(),
  prefix: text('prefix'),
  key: text('key').notNull(),
  refillInterval: bigint('refill_interval', { mode: 'number' }),
  refillAmount: bigint('refill_amount', { mode: 'number' }),
  lastRefillAt: timestamp('last_refill_at'),
  enabled: boolean('enabled').default(true),
  rateLimitEnabled: boolean('rate_limit_enabled').default(true),
  rateLimitTimeWindow: bigint('rate_limit_time_window', { mode: 'number' }),
  rateLimitMax: bigint('rate_limit_max', { mode: 'number' }),
  requestCount: bigint('request_count', { mode: 'number' }).default(0),
  remaining: bigint('remaining', { mode: 'number' }),
  lastRequest: timestamp('last_request'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  permissions: text('permissions'),
  metadata: text('metadata'),
}, (table) => [
  index('apikey_config_id_idx').on(table.configId),
  index('apikey_reference_id_idx').on(table.referenceId),
  index('apikey_key_idx').on(table.key),
]);

export type ApiKey = typeof apikey.$inferSelect;
export type NewApiKey = typeof apikey.$inferInsert;

import { pgTable, text, timestamp, bigint, uuid, boolean, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { globalFileBlobs } from './global-storage';
import { products, productVersions, marketplaceSources } from './marketplace';

export const userStorageConnections = pgTable('user_storage_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id),
  providerType: text('provider_type').notNull(),
  providerName: text('provider_name').notNull(),
  externalAccountId: text('external_account_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),
  rootFolderId: text('root_folder_id'),
  rootPath: text('root_path'),
  credentialsEncrypted: text('credentials_encrypted'),
  syncMode: text('sync_mode').notNull().default('snapshot'),
  enabled: boolean('enabled').notNull().default(true),
  lastSuccessfulSyncAt: timestamp('last_successful_sync_at'),
  lastAttemptedSyncAt: timestamp('last_attempted_sync_at'),
  lastError: text('last_error'),
  errorCount: integer('error_count').notNull().default(0),
  scheduleEnabled: boolean('schedule_enabled').notNull().default(false),
  scheduleFrequency: text('schedule_frequency'),
  scheduleDayOfWeek: integer('schedule_day_of_week'),
  scheduleTime: text('schedule_time'),
  scheduleTimezone: text('schedule_timezone').notNull().default('UTC'),
  lastScheduledAt: timestamp('last_scheduled_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('user_storage_connections_user_idx').on(table.userId),
  index('user_storage_connections_enabled_idx').on(table.enabled),
]);

export const syncTokens = pgTable('sync_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull(),
  name: text('name').notNull(),
  scopes: text('scopes').notNull().default('sync:manifest,sync:read,sync:export'),
  clientMetadata: text('client_metadata'),
  expiresAt: timestamp('expires_at'),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('sync_tokens_user_idx').on(table.userId),
  uniqueIndex('sync_tokens_hash_idx').on(table.tokenHash),
]);

export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id').notNull().references(() => userStorageConnections.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('queued'),
  filesDiscovered: integer('files_discovered').notNull().default(0),
  filesUploaded: integer('files_uploaded').notNull().default(0),
  filesSkipped: integer('files_skipped').notNull().default(0),
  filesFailed: integer('files_failed').notNull().default(0),
  bytesUploaded: bigint('bytes_uploaded', { mode: 'number' }).notNull().default(0),
  manifestId: text('manifest_id'),
  cursor: text('cursor'),
  errorSummary: text('error_summary'),
  failureCode: text('failure_code'),
  failureDetails: jsonb('failure_details').$type<Record<string, string | number | boolean | null>>(),
  cancelRequestedAt: timestamp('cancel_requested_at'),
  pgBossJobId: text('pgboss_job_id'),
  pgBossQueue: text('pgboss_queue'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('sync_runs_connection_idx').on(table.connectionId),
  index('sync_runs_user_idx').on(table.userId),
]);

export const syncItems = pgTable('sync_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => syncRuns.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull().references(() => userStorageConnections.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blobId: uuid('blob_id').notNull().references(() => globalFileBlobs.id),
  destinationKey: text('destination_key').notNull(),
  contentHash: text('content_hash').notNull(),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('pending'),
  remoteId: text('remote_id'),
  etag: text('etag'),
  retryCount: integer('retry_count').notNull().default(0),
  lastError: text('last_error'),
  transferSessionId: text('transfer_session_id'),
  bytesTransferred: bigint('bytes_transferred', { mode: 'number' }).notNull().default(0),
  lastHttpStatus: integer('last_http_status'),
  lastAttemptedAt: timestamp('last_attempted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('sync_items_run_idx').on(table.runId),
  uniqueIndex('sync_items_destination_blob_idx').on(table.connectionId, table.blobId, table.contentHash),
]);

/** Durable, user-visible diagnostics for failed objects within a single sync run. */
export const syncRunFailures = pgTable('sync_run_failures', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => syncRuns.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  itemKind: text('item_kind').notNull(),
  itemName: text('item_name').notNull(),
  destinationKey: text('destination_key').notNull(),
  errorMessage: text('error_message').notNull(),
  failureCode: text('failure_code').notNull(),
  httpStatus: integer('http_status'),
  retryable: boolean('retryable').notNull().default(false),
  status: text('status').notNull().default('failed'),
  attemptCount: integer('attempt_count').notNull().default(1),
  firstFailedAt: timestamp('first_failed_at').notNull().defaultNow(),
  lastFailedAt: timestamp('last_failed_at').notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('sync_run_failures_run_idx').on(table.runId),
  index('sync_run_failures_user_idx').on(table.userId),
  uniqueIndex('sync_run_failures_run_destination_idx').on(table.runId, table.destinationKey),
]);

export const userLibraryItems = pgTable('user_library_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id),
  productId: uuid('product_id').references(() => products.id),
  marketplaceSourceId: uuid('marketplace_source_id').references(() => marketplaceSources.id),
  externalPurchaseId: text('external_purchase_id'),
  licenseKey: text('license_key'),
  acquiredAt: timestamp('acquired_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const userAssetFiles = pgTable('user_asset_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id),
  libraryItemId: uuid('library_item_id').references(() => userLibraryItems.id),
  productVersionId: uuid('product_version_id').references(() => productVersions.id),
  blobId: uuid('blob_id').notNull().references(() => globalFileBlobs.id),
  logicalSizeBytes: bigint('logical_size_bytes', { mode: 'number' }).notNull(),
  isBackedUp: boolean('is_backed_up').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const storageAccounting = pgTable('storage_accounting', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id),
  logicalBytesUsed: bigint('logical_bytes_used', { mode: 'number' }).notNull().default(0),
  physicalBytesUsed: bigint('physical_bytes_used', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type UserStorageConnection = typeof userStorageConnections.$inferSelect;
export type NewUserStorageConnection = typeof userStorageConnections.$inferInsert;
export type UserLibraryItem = typeof userLibraryItems.$inferSelect;
export type NewUserLibraryItem = typeof userLibraryItems.$inferInsert;
export type UserAssetFile = typeof userAssetFiles.$inferSelect;
export type NewUserAssetFile = typeof userAssetFiles.$inferInsert;
export type StorageAccounting = typeof storageAccounting.$inferSelect;
export type NewStorageAccounting = typeof storageAccounting.$inferInsert;
export type SyncToken = typeof syncTokens.$inferSelect;
export type NewSyncToken = typeof syncTokens.$inferInsert;
export type SyncRun = typeof syncRuns.$inferSelect;
export type SyncItem = typeof syncItems.$inferSelect;
export type SyncRunFailure = typeof syncRunFailures.$inferSelect;

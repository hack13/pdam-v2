import { pgTable, text, timestamp, bigint, uuid, boolean } from 'drizzle-orm/pg-core';
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
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

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

import { pgTable, text, timestamp, uuid, boolean, integer, bigint } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { fileThumbnails, globalFileBlobs } from './global-storage';

export const marketplaceSources = pgTable('marketplace_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  baseUrl: text('base_url'),
  isUserDefined: boolean('is_user_defined').notNull().default(false),
  ownerUserId: text('owner_user_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const creators = pgTable('creators', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  marketplaceSourceId: uuid('marketplace_source_id').references(() => marketplaceSources.id),
  externalId: text('external_id'),
  profileUrl: text('profile_url'),
  avatarUrl: text('avatar_url'),
  /** Creator-managed presentation fields for the public PDAM profile. */
  bio: text('bio'),
  profileImageUrl: text('profile_image_url'),
  headerImageUrl: text('header_image_url'),
  enrolledByUserId: text('enrolled_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorIds: uuid('creator_ids').array(),
  ownerUserId: text('owner_user_id').references(() => users.id),
  marketplaceSourceId: uuid('marketplace_source_id').references(() => marketplaceSources.id),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  descriptionHtml: text('description_html'),
  descriptionText: text('description_text'),
  tags: text('tags').array(),
  featuredThumbnailKey: text('featured_thumbnail_key'),
  thumbnailFileThumbnailId: uuid('thumbnail_file_thumbnail_id').references(() => fileThumbnails.id),
  licenseKey: text('license_key'),
  externalId: text('external_id'),
  productUrl: text('product_url'),
  /** When true, this product appears in the public gallery as a creator listing. */
  isGalleryListed: boolean('is_gallery_listed').notNull().default(false),
  /**
   * If set, this product is a buyer's linked copy of a creator gallery listing.
   * The buyer can download and receive updates, but cannot modify the source.
   */
  sourceProductId: uuid('source_product_id'),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const productDescriptionImages = pgTable('product_description_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  blobId: uuid('blob_id').notNull().references(() => globalFileBlobs.id),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  logicalSizeBytes: bigint('logical_size_bytes', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const productVersions = pgTable('product_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id),
  version: text('version').notNull(),
  releaseNotes: text('release_notes'),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type MarketplaceSource = typeof marketplaceSources.$inferSelect;
export type NewMarketplaceSource = typeof marketplaceSources.$inferInsert;
export type Creator = typeof creators.$inferSelect;
export type NewCreator = typeof creators.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductDescriptionImage = typeof productDescriptionImages.$inferSelect;
export type NewProductDescriptionImage = typeof productDescriptionImages.$inferInsert;
export type ProductVersion = typeof productVersions.$inferSelect;
export type NewProductVersion = typeof productVersions.$inferInsert;

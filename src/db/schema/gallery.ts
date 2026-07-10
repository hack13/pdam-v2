import { pgTable, text, timestamp, uuid, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { marketplaceSources, products } from './marketplace';

/** Purchase destinations shown on a gallery listing (Gumroad, Jinxxy, etc.). */
export const galleryPurchaseLinks = pgTable(
  'gallery_purchase_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    marketplaceSourceId: uuid('marketplace_source_id')
      .notNull()
      .references(() => marketplaceSources.id),
    productUrl: text('product_url').notNull(),
    label: text('label'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('gallery_purchase_links_product_idx').on(table.productId),
  ],
);

/**
 * Creator-defined webhook endpoints used to verify license keys
 * against their own tooling (per marketplace or as a default).
 */
export const creatorVerificationWebhooks = pgTable(
  'creator_verification_webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null = default endpoint for all marketplaces without a specific webhook. */
    marketplaceSourceId: uuid('marketplace_source_id').references(() => marketplaceSources.id),
    endpointUrl: text('endpoint_url').notNull(),
    secret: text('secret').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('creator_verification_webhooks_user_idx').on(table.userId),
  ],
);

/** Buyer "I own this" verification attempts against a gallery listing. */
export const ownershipVerifications = pgTable(
  'ownership_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    marketplaceSourceId: uuid('marketplace_source_id')
      .notNull()
      .references(() => marketplaceSources.id),
    licenseKey: text('license_key').notNull(),
    status: text('status').notNull().default('pending'),
    failureReason: text('failure_reason'),
    linkedProductId: uuid('linked_product_id').references(() => products.id, { onDelete: 'set null' }),
    verifiedAt: timestamp('verified_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('ownership_verifications_product_idx').on(table.productId),
    index('ownership_verifications_user_idx').on(table.userId),
    uniqueIndex('ownership_verifications_user_product_uidx').on(table.userId, table.productId),
  ],
);

/** Click-through analytics when users open a marketplace purchase link. */
export const marketplaceClickEvents = pgTable(
  'marketplace_click_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    purchaseLinkId: uuid('purchase_link_id').references(() => galleryPurchaseLinks.id, {
      onDelete: 'set null',
    }),
    marketplaceSourceId: uuid('marketplace_source_id')
      .notNull()
      .references(() => marketplaceSources.id),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('marketplace_click_events_product_idx').on(table.productId),
    index('marketplace_click_events_marketplace_idx').on(table.marketplaceSourceId),
  ],
);

export type GalleryPurchaseLink = typeof galleryPurchaseLinks.$inferSelect;
export type NewGalleryPurchaseLink = typeof galleryPurchaseLinks.$inferInsert;
export type CreatorVerificationWebhook = typeof creatorVerificationWebhooks.$inferSelect;
export type NewCreatorVerificationWebhook = typeof creatorVerificationWebhooks.$inferInsert;
export type OwnershipVerification = typeof ownershipVerifications.$inferSelect;
export type NewOwnershipVerification = typeof ownershipVerifications.$inferInsert;
export type MarketplaceClickEvent = typeof marketplaceClickEvents.$inferSelect;
export type NewMarketplaceClickEvent = typeof marketplaceClickEvents.$inferInsert;

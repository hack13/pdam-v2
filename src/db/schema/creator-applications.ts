import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { creators } from './marketplace';

/**
 * Onboarding applications to become a content creator.
 * Admin must approve before role=creator and catalog enrollment are granted.
 */
export const creatorApplications = pgTable(
  'creator_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Existing catalog creator to claim, if any. */
    creatorId: uuid('creator_id').references(() => creators.id, { onDelete: 'set null' }),
    /** Display name when creating a new catalog entry, or confirming an existing one. */
    requestedCreatorName: text('requested_creator_name').notNull(),
    /** Marketplace / storefront URLs or other proof of identity. */
    proofUrls: text('proof_urls').array(),
    /** Free-form note from the applicant (how they can be verified). */
    applicantNote: text('applicant_note'),
    status: text('status').notNull().default('pending'),
    adminNote: text('admin_note'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('creator_applications_user_idx').on(table.userId),
    index('creator_applications_status_idx').on(table.status),
  ],
);

export type CreatorApplication = typeof creatorApplications.$inferSelect;
export type NewCreatorApplication = typeof creatorApplications.$inferInsert;

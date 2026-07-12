import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * A single-use beta invitation. Referral codes are deliberately issued as
 * separate rows so each one has its own availability time and audit trail.
 */
export const betaInvites = pgTable(
  'beta_invite',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    inviterUserId: text('inviter_user_id').references(() => users.id, { onDelete: 'set null' }),
    availableAt: timestamp('available_at').notNull(),
    acceptedByUserId: text('accepted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    acceptedByEmail: text('accepted_by_email'),
    acceptedAt: timestamp('accepted_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('beta_invite_code_idx').on(table.code),
    index('beta_invite_inviter_available_idx').on(table.inviterUserId, table.availableAt),
    index('beta_invite_accepted_email_idx').on(table.acceptedByEmail),
  ],
);

export type BetaInvite = typeof betaInvites.$inferSelect;

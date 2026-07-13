import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'),
  /** When true, this user may mint single-use beta invite codes on demand. */
  canGenerateInvites: boolean('can_generate_invites').notNull().default(false),
  /** Lifetime max invites this user may mint (admins ignore this limit). */
  inviteGenerationLimit: integer('invite_generation_limit').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

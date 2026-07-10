import { relations } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const passkey = pgTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    createdAt: timestamp('created_at'),
    aaguid: text('aaguid'),
  },
  (table) => [
    index('passkey_userId_idx').on(table.userId),
    index('passkey_credentialID_idx').on(table.credentialID),
  ],
);

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(users, {
    fields: [passkey.userId],
    references: [users.id],
  }),
}));

export type Passkey = typeof passkey.$inferSelect;
export type NewPasskey = typeof passkey.$inferInsert;

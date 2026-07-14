import { pgTable, text, timestamp, bigint, uuid, jsonb } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { productVersions } from './marketplace';

export type CompletedPart = {
  partNumber: number;
  etag: string;
};

export const pendingUploads = pgTable('pending_uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id),
  productVersionId: uuid('product_version_id').notNull().references(() => productVersions.id),
  sha256: text('sha256').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: bigint('file_size', { mode: 'number' }).notNull(),
  storageKey: text('storage_key').notNull(),
  s3UploadId: text('s3_upload_id').notNull(),
  completedParts: jsonb('completed_parts').$type<CompletedPart[]>().notNull().default([]),
  status: text('status').notNull().default('pending'),
  promotionJobId: text('promotion_job_id'),
  errorSummary: text('error_summary'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
});

export type PendingUpload = typeof pendingUploads.$inferSelect;
export type NewPendingUpload = typeof pendingUploads.$inferInsert;

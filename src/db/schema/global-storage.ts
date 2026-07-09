import { pgTable, text, timestamp, bigint, integer, uuid } from 'drizzle-orm/pg-core';

export const globalFileBlobs = pgTable('global_file_blobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sha256: text('sha256').notNull().unique(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: bigint('file_size', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const blobStorageObjects = pgTable('blob_storage_objects', {
  id: uuid('id').primaryKey().defaultRandom(),
  blobId: uuid('blob_id').notNull().references(() => globalFileBlobs.id),
  storageProviderType: text('storage_provider_type').notNull(),
  storageKey: text('storage_key').notNull(),
  bucketName: text('bucket_name').notNull(),
  physicalSizeBytes: bigint('physical_size_bytes', { mode: 'number' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const fileThumbnails = pgTable('file_thumbnails', {
  id: uuid('id').primaryKey().defaultRandom(),
  blobId: uuid('blob_id').notNull().references(() => globalFileBlobs.id),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  mimeType: text('mime_type').notNull(),
  storageKey: text('storage_key').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type GlobalFileBlob = typeof globalFileBlobs.$inferSelect;
export type NewGlobalFileBlob = typeof globalFileBlobs.$inferInsert;
export type BlobStorageObject = typeof blobStorageObjects.$inferSelect;
export type NewBlobStorageObject = typeof blobStorageObjects.$inferInsert;
export type FileThumbnail = typeof fileThumbnails.$inferSelect;
export type NewFileThumbnail = typeof fileThumbnails.$inferInsert;

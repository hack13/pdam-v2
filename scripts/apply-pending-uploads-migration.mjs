#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

function loadDatabaseUrl() {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key === 'DATABASE_URL' && value) return value;
  }
  throw new Error('DATABASE_URL not found in .env');
}

const databaseUrl = process.env.DATABASE_URL ?? loadDatabaseUrl();
const sql = postgres(databaseUrl);

try {
  await sql`
    CREATE TABLE IF NOT EXISTS "pending_uploads" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" text NOT NULL,
      "product_version_id" uuid NOT NULL,
      "sha256" text NOT NULL,
      "file_name" text NOT NULL,
      "mime_type" text NOT NULL,
      "file_size" bigint NOT NULL,
      "storage_key" text NOT NULL,
      "s3_upload_id" text NOT NULL,
      "completed_parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "status" text DEFAULT 'pending' NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "expires_at" timestamp NOT NULL
    )
  `;

  await sql`
    ALTER TABLE "pending_uploads"
      ADD COLUMN IF NOT EXISTS "promotion_job_id" text,
      ADD COLUMN IF NOT EXISTS "error_summary" text
  `;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pending_uploads_user_id_auth_user_id_fk'
      ) THEN
        ALTER TABLE "pending_uploads"
          ADD CONSTRAINT "pending_uploads_user_id_auth_user_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id")
          ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$
  `;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pending_uploads_product_version_id_product_versions_id_fk'
      ) THEN
        ALTER TABLE "pending_uploads"
          ADD CONSTRAINT "pending_uploads_product_version_id_product_versions_id_fk"
          FOREIGN KEY ("product_version_id") REFERENCES "public"."product_versions"("id")
          ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$
  `;

  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'pending_uploads'
    ) AS exists
  `;

  console.log(`pending_uploads table ready (exists: ${exists}).`);
} finally {
  await sql.end();
}

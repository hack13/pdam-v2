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
    CREATE TABLE IF NOT EXISTS "product_description_images" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "product_id" uuid NOT NULL,
      "blob_id" uuid NOT NULL,
      "width" integer NOT NULL,
      "height" integer NOT NULL,
      "logical_size_bytes" bigint NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_description_images_product_id_products_id_fk'
      ) THEN
        ALTER TABLE "product_description_images"
          ADD CONSTRAINT "product_description_images_product_id_products_id_fk"
          FOREIGN KEY ("product_id") REFERENCES "public"."products"("id")
          ON DELETE cascade ON UPDATE no action;
      END IF;
    END $$
  `;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_description_images_blob_id_global_file_blobs_id_fk'
      ) THEN
        ALTER TABLE "product_description_images"
          ADD CONSTRAINT "product_description_images_blob_id_global_file_blobs_id_fk"
          FOREIGN KEY ("blob_id") REFERENCES "public"."global_file_blobs"("id")
          ON DELETE no action ON UPDATE no action;
      END IF;
    END $$
  `;

  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'product_description_images'
    ) AS exists
  `;

  console.log(`product_description_images table ready (exists: ${exists}).`);
} finally {
  await sql.end();
}

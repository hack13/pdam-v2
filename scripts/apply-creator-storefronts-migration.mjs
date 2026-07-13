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
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS bio text`;
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS profile_image_url text`;
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS header_image_url text`;

  await sql`
    CREATE TABLE IF NOT EXISTS gallery_listing_media (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      media_type text NOT NULL,
      url text NOT NULL,
      storage_key text,
      alt_text text,
      caption text,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS gallery_listing_media_product_idx
    ON gallery_listing_media(product_id)
  `;

  console.log('Applied creator storefront profile and gallery media migration.');
} finally {
  await sql.end();
}

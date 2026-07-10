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
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS is_gallery_listed boolean NOT NULL DEFAULT false
  `;
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS source_product_id uuid
  `;
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS last_synced_at timestamp
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS gallery_purchase_links (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      marketplace_source_id uuid NOT NULL REFERENCES marketplace_sources(id),
      product_url text NOT NULL,
      label text,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS gallery_purchase_links_product_idx ON gallery_purchase_links(product_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS creator_verification_webhooks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      marketplace_source_id uuid REFERENCES marketplace_sources(id),
      endpoint_url text NOT NULL,
      secret text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS creator_verification_webhooks_user_idx ON creator_verification_webhooks(user_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS ownership_verifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      marketplace_source_id uuid NOT NULL REFERENCES marketplace_sources(id),
      license_key text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      failure_reason text,
      linked_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
      verified_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS ownership_verifications_product_idx ON ownership_verifications(product_id)`;
  await sql`CREATE INDEX IF NOT EXISTS ownership_verifications_user_idx ON ownership_verifications(user_id)`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ownership_verifications_user_product_uidx
    ON ownership_verifications(user_id, product_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS marketplace_click_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      purchase_link_id uuid REFERENCES gallery_purchase_links(id) ON DELETE SET NULL,
      marketplace_source_id uuid NOT NULL REFERENCES marketplace_sources(id),
      user_id text REFERENCES auth_user(id) ON DELETE SET NULL,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS marketplace_click_events_product_idx ON marketplace_click_events(product_id)`;
  await sql`CREATE INDEX IF NOT EXISTS marketplace_click_events_marketplace_idx ON marketplace_click_events(marketplace_source_id)`;

  console.log('Applied gallery / content-creator schema migration.');
} finally {
  await sql.end();
}

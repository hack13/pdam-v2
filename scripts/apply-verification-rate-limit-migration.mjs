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
    CREATE TABLE IF NOT EXISTS "verification_rate_limits" (
      "user_id" text NOT NULL,
      "product_id" uuid NOT NULL,
      "marketplace_source_id" uuid NOT NULL,
      "attempt_count" integer DEFAULT 0 NOT NULL,
      "next_allowed_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      PRIMARY KEY ("user_id", "product_id", "marketplace_source_id"),
      CONSTRAINT "verification_rate_limits_user_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade,
      CONSTRAINT "verification_rate_limits_product_id_fk"
        FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade,
      CONSTRAINT "verification_rate_limits_marketplace_source_id_fk"
        FOREIGN KEY ("marketplace_source_id") REFERENCES "public"."marketplace_sources"("id") ON DELETE cascade
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "verification_ip_rate_limits" (
      "ip_hash" text PRIMARY KEY,
      "window_started_at" timestamp DEFAULT now() NOT NULL,
      "request_count" integer DEFAULT 0 NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS "verification_ip_rate_limits_updated_idx"
    ON "verification_ip_rate_limits" ("updated_at")
  `;

  console.log('Verification rate-limit tables ready.');
} finally {
  await sql.end();
}

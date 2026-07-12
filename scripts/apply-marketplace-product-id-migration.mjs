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
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    if (trimmed.slice(0, separator).trim() === 'DATABASE_URL') {
      return trimmed.slice(separator + 1).trim();
    }
  }
  throw new Error('DATABASE_URL not found in .env');
}

const sql = postgres(process.env.DATABASE_URL ?? loadDatabaseUrl());

try {
  await sql`
    ALTER TABLE "gallery_purchase_links"
    ADD COLUMN IF NOT EXISTS "marketplace_product_id" text
  `;
  console.log('Marketplace product ID column ready.');
} finally {
  await sql.end();
}

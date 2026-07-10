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
    CREATE TABLE IF NOT EXISTS creator_applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      creator_id uuid REFERENCES creators(id) ON DELETE SET NULL,
      requested_creator_name text NOT NULL,
      proof_urls text[],
      applicant_note text,
      status text NOT NULL DEFAULT 'pending',
      admin_note text,
      reviewed_by_user_id text REFERENCES auth_user(id) ON DELETE SET NULL,
      reviewed_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS creator_applications_user_idx ON creator_applications(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS creator_applications_status_idx ON creator_applications(status)`;
  console.log('Applied creator_applications migration.');
} finally {
  await sql.end();
}

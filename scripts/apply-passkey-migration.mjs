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
    CREATE TABLE IF NOT EXISTS passkey (
      id text PRIMARY KEY,
      name text,
      public_key text NOT NULL,
      user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      credential_id text NOT NULL,
      counter integer NOT NULL,
      device_type text NOT NULL,
      backed_up boolean NOT NULL,
      transports text,
      created_at timestamp,
      aaguid text
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS passkey_userId_idx ON passkey(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS passkey_credentialID_idx ON passkey(credential_id)`;
  console.log('Applied passkey migration.');
} finally {
  await sql.end();
}

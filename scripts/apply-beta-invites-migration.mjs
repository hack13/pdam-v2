#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf-8');
const databaseUrl = process.env.DATABASE_URL ?? envContent.split('\n').map((line) => line.trim()).find((line) => line.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length);
if (!databaseUrl) throw new Error('DATABASE_URL not found in .env');

const sql = postgres(databaseUrl);
try {
  await sql`
    CREATE TABLE IF NOT EXISTS beta_invite (
      id text PRIMARY KEY,
      code text NOT NULL UNIQUE,
      inviter_user_id text REFERENCES auth_user(id) ON DELETE SET NULL,
      available_at timestamp NOT NULL,
      accepted_by_user_id text REFERENCES auth_user(id) ON DELETE SET NULL,
      accepted_by_email text,
      accepted_at timestamp,
      revoked_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS beta_invite_inviter_available_idx ON beta_invite(inviter_user_id, available_at)`;
  await sql`CREATE INDEX IF NOT EXISTS beta_invite_accepted_email_idx ON beta_invite(accepted_by_email)`;
  console.log('Applied beta invites migration.');
} finally {
  await sql.end();
}

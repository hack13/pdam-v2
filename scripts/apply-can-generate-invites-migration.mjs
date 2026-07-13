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
    ALTER TABLE auth_user
    ADD COLUMN IF NOT EXISTS can_generate_invites boolean NOT NULL DEFAULT false
  `;
  console.log('Added auth_user.can_generate_invites column (or it already existed).');

  await sql`
    ALTER TABLE auth_user
    ADD COLUMN IF NOT EXISTS invite_generation_limit integer NOT NULL DEFAULT 0
  `;
  console.log('Added auth_user.invite_generation_limit column (or it already existed).');

  // Timed referral unlocks are retired; unlock any leftover unused codes immediately.
  const unlocked = await sql`
    UPDATE beta_invite
    SET available_at = now()
    WHERE accepted_at IS NULL
      AND revoked_at IS NULL
      AND available_at > now()
  `;
  console.log(`Unlocked ${unlocked.count} previously time-gated invite(s).`);
} finally {
  await sql.end();
}

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
      const value = trimmed.slice(separator + 1).trim();
      if (value) return value;
    }
  }
  throw new Error('DATABASE_URL not found in .env');
}

const sql = postgres(process.env.DATABASE_URL ?? loadDatabaseUrl());

try {
  await sql`CREATE TABLE IF NOT EXISTS feedback_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    category text NOT NULL DEFAULT 'general',
    message text NOT NULL,
    page_url text,
    status text NOT NULL DEFAULT 'new',
    admin_note text,
    reviewed_by_user_id text REFERENCES auth_user(id) ON DELETE SET NULL,
    reviewed_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS feedback_items_status_idx ON feedback_items(status)`;
  await sql`CREATE INDEX IF NOT EXISTS feedback_items_user_idx ON feedback_items(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS feedback_items_created_at_idx ON feedback_items(created_at)`;
  await sql`CREATE TABLE IF NOT EXISTS feedback_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id uuid NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    file_size integer NOT NULL,
    storage_key text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS feedback_attachments_feedback_idx ON feedback_attachments(feedback_id)`;
  console.log('Applied beta feedback migration.');
} finally {
  await sql.end();
}

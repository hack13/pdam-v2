#!/usr/bin/env node

import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
// Docker supplies configuration through environment variables and deliberately
// does not copy the local development .env file into the image.
const envContent = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
const env = Object.fromEntries(envContent.split('\n').map((line) => {
  const [key, ...value] = line.trim().split('=');
  return [key, value.join('=')];
}).filter(([key, value]) => key && value && !key.startsWith('#')));
const databaseUrl = process.env.DATABASE_URL ?? env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const code = randomBytes(24).toString('base64url');
const sql = postgres(databaseUrl);
try {
  await sql`INSERT INTO beta_invite (id, code, available_at) VALUES (${randomUUID()}, ${code}, now())`;
  console.log(`Beta invite link: ${(process.env.BETTER_AUTH_URL ?? env.BETTER_AUTH_URL ?? 'http://localhost:4321').replace(/\/$/, '')}/signup?invite=${code}`);
} finally {
  await sql.end();
}

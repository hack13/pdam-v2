#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { S3Client, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

function loadEnv() {
  const env = {};
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (value) env[key] = value;
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(databaseUrl);

function createS3Client() {
  if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    return null;
  }

  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? 'auto',
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
}

const s3 = createS3Client();
const bucket = env.S3_BUCKET;

try {
  const expired = await sql`
    SELECT id, storage_key, s3_upload_id
    FROM pending_uploads
    WHERE status = 'pending'
      AND expires_at < now()
  `;

  let aborted = 0;

  for (const session of expired) {
    if (s3 && bucket) {
      try {
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: session.storage_key,
            UploadId: session.s3_upload_id,
          }),
        );
      } catch {
        // Upload may already be gone.
      }
    }

    await sql`
      UPDATE pending_uploads
      SET status = 'aborted'
      WHERE id = ${session.id}
    `;
    aborted++;
  }

  console.log(`Cleaned up ${aborted} expired pending upload session(s).`);
} finally {
  await sql.end();
}

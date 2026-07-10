import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { createHmac } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvValue(name) {
  const envPath = join(__dirname, '..', '.env');
  try {
    const envContent = readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      if (key === name) return trimmed.slice(separator + 1).trim();
    }
  } catch {
    // Environment variables may be supplied by the deployment instead.
  }
  return undefined;
}

const secret = process.env.BETTER_AUTH_SECRET ?? loadEnvValue('BETTER_AUTH_SECRET');
if (!secret) throw new Error('BETTER_AUTH_SECRET is required');

const url = process.env.DATABASE_URL ?? loadEnvValue('DATABASE_URL');
if (!url) throw new Error('DATABASE_URL is required');

const sql = postgres(url, { max: 1 });
try {
  const rows = await sql`
    SELECT id, license_key
    FROM ownership_verifications
    WHERE license_key NOT LIKE 'hmac-sha256:%'
  `;

  for (const row of rows) {
    const fingerprint = `hmac-sha256:${createHmac('sha256', secret)
      .update(row.license_key)
      .digest('hex')}`;
    await sql`
      UPDATE ownership_verifications
      SET license_key = ${fingerprint}
      WHERE id = ${row.id}
    `;
  }

  console.log(`Fingerprinting complete: ${rows.length} row(s) updated.`);
} finally {
  await sql.end();
}

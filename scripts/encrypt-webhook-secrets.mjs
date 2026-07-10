import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

function loadEnv() {
  try {
    const text = readFileSync('.env', 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}

loadEnv();
const databaseUrl = process.env.DATABASE_URL;
const configuredKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ?? process.env.BETTER_AUTH_SECRET;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!configuredKey) throw new Error('WEBHOOK_SECRET_ENCRYPTION_KEY or BETTER_AUTH_SECRET is required');
const key = /^[0-9a-f]{64}$/i.test(configuredKey)
  ? Buffer.from(configuredKey, 'hex')
  : createHash('sha256').update(configuredKey).digest();

function encrypt(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

const sql = postgres(databaseUrl);
try {
  const rows = await sql`SELECT id, secret FROM creator_verification_webhooks WHERE secret NOT LIKE 'enc:v1:%'`;
  for (const row of rows) await sql`UPDATE creator_verification_webhooks SET secret = ${encrypt(row.secret)}, updated_at = NOW() WHERE id = ${row.id}`;
  console.log(`Encrypted ${rows.length} webhook secret${rows.length === 1 ? '' : 's'}.`);
} finally {
  await sql.end();
}

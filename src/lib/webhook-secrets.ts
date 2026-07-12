import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENCRYPTED_PREFIX = 'enc:v1:';

function encryptionKey(): Buffer {
  const runtimeEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const configured = runtimeEnv?.WEBHOOK_SECRET_ENCRYPTION_KEY
    ?? runtimeEnv?.BETTER_AUTH_SECRET
    ?? process.env.WEBHOOK_SECRET_ENCRYPTION_KEY
    ?? process.env.BETTER_AUTH_SECRET;
  if (!configured) throw new Error('WEBHOOK_SECRET_ENCRYPTION_KEY or BETTER_AUTH_SECRET is required');
  if (/^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  return createHash('sha256').update(configured).digest();
}

export function encryptWebhookSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptWebhookSecret(value: string): string {
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;
  const [ivEncoded, tagEncoded, ciphertextEncoded] = value.slice(ENCRYPTED_PREFIX.length).split('.');
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error('Invalid encrypted webhook secret');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

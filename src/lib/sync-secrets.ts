import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function configuredSecret(): string {
  const runtimeEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const secret = [
    runtimeEnv?.WEBHOOK_SECRET_ENCRYPTION_KEY,
    runtimeEnv?.BETTER_AUTH_SECRET,
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY,
    process.env.BETTER_AUTH_SECRET,
  ].find((value): value is string => typeof value === 'string' && value.length > 0);

  if (secret) return secret;
  if (isProduction()) {
    throw new Error('WEBHOOK_SECRET_ENCRYPTION_KEY or BETTER_AUTH_SECRET is required in production');
  }

  return 'dev-only-secret';
}

function key(secret: string) { return createHash('sha256').update(secret).digest(); }

export function encryptSyncSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(configuredSecret()), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}
export function decryptSyncSecret(value: string) {
  if (!value.startsWith(PREFIX)) return value;
  const [iv, tag, data] = value.slice(PREFIX.length).split('.');
  if (!iv || !tag || !data) throw new Error('Invalid encrypted sync credentials');
  const ciphertext = Buffer.from(data, 'base64url');
  const authTag = Buffer.from(tag, 'base64url');
  const secret = configuredSecret();
  // The known development fallback must never be accepted in production.
  const secrets = isProduction() ? [secret] : [secret, 'dev-only-secret'].filter((candidate, index, values) => values.indexOf(candidate) === index);
  let lastError: unknown;
  for (const secret of secrets) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to decrypt sync credentials');
}

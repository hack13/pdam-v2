import { createHmac } from 'node:crypto';

function getFingerprintSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required to fingerprint license keys');
  return secret;
}

/** A stable, non-reversible identifier for a verification-attempt license key. */
export function fingerprintLicenseKey(licenseKey: string): string {
  return `hmac-sha256:${createHmac('sha256', getFingerprintSecret())
    .update(licenseKey)
    .digest('hex')}`;
}

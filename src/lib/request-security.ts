import type { APIContext } from 'astro';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function hasApiKey(context: APIContext): boolean {
  const xApiKey = context.request.headers.get('x-api-key');
  if (xApiKey?.trim()) return true;

  const authorization = context.request.headers.get('authorization');
  return !!authorization?.match(/^bearer\s+\S/i);
}

function expectedOrigin(context: APIContext): string {
  const configured = process.env.BETTER_AUTH_URL?.replace(/\/$/, '');
  return configured || new URL(context.request.url).origin;
}

/**
 * Rejects cross-site state-changing requests when authentication relies on a
 * browser session cookie. Header-authenticated API clients are not affected.
 */
export function validateRequestOrigin(context: APIContext): boolean {
  if (SAFE_METHODS.has(context.request.method.toUpperCase()) || hasApiKey(context)) {
    return true;
  }

  const expected = expectedOrigin(context);
  const origin = context.request.headers.get('origin');
  if (origin) return origin === expected;

  const referer = context.request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      return false;
    }
  }

  // Browsers normally send Origin for JSON mutations. Rejecting requests with
  // neither header prevents ambiguous cookie-authenticated cross-site calls.
  return false;
}

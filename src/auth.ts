import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey } from '@better-auth/api-key';
import { getAuthenticatorName, passkey } from '@better-auth/passkey';
import { db } from './db';
import * as schema from './db/schema';

function passkeyOriginConfig() {
  const baseURL = process.env.BETTER_AUTH_URL?.replace(/\/$/, '');
  if (!baseURL) {
    return { rpID: 'localhost' as const, origin: undefined as string | undefined };
  }
  try {
    const url = new URL(baseURL);
    return { rpID: url.hostname, origin: baseURL };
  } catch {
    return { rpID: 'localhost' as const, origin: baseURL };
  }
}

const { rpID, origin } = passkeyOriginConfig();

export const auth = betterAuth({
  appName: 'PDAM',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      apikey: schema.apikey,
      passkey: schema.passkey,
    },
  }),
  user: {
    modelName: 'user',
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'user',
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    apiKey({
      defaultPrefix: 'pdam_',
      rateLimit: {
        enabled: true,
        timeWindow: 1000 * 60 * 60 * 24,
        maxRequests: 5000,
      },
    }),
    passkey({
      rpName: 'PDAM',
      rpID,
      origin,
      registration: {
        afterVerification: async ({ verification }) => ({
          name: getAuthenticatorName(verification.registrationInfo?.aaguid),
        }),
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;

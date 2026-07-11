import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey } from '@better-auth/api-key';
import { getAuthenticatorName, passkey } from '@better-auth/passkey';
import { db } from './db';
import * as schema from './db/schema';

const runtimeEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const betterAuthUrl = runtimeEnv?.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL;
const betterAuthSecret = runtimeEnv?.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
const googleClientId = runtimeEnv?.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = runtimeEnv?.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

function passkeyOriginConfig() {
  const baseURL = betterAuthUrl?.replace(/\/$/, '');
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
  baseURL: betterAuthUrl,
  secret: betterAuthSecret,
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
  account: {
    accountLinking: {
      // Drive accounts are often separate from the email used for PDAM.
      // Linking still requires an authenticated PDAM session and Google OAuth
      // confirmation; the PDAM account email is never changed by this.
      allowDifferentEmails: true,
    },
  },
  socialProviders: googleClientId && googleClientSecret ? {
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      // A Drive destination runs after the browser session has ended, so ask
      // Google for a refresh token when the account is linked.
      accessType: 'offline',
      prompt: 'select_account consent',
    },
  } : {},
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

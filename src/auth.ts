import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey } from '@better-auth/api-key';
import { getAuthenticatorName, passkey } from '@better-auth/passkey';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { db } from './db';
import * as schema from './db/schema';
import { acceptInviteForEmail, attachAcceptedInviteToUser } from './lib/beta-invites';

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
  appName: 'TailCache',
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
      canGenerateInvites: {
        type: 'boolean',
        defaultValue: false,
        input: false,
      },
      inviteGenerationLimit: {
        type: 'number',
        defaultValue: 0,
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  account: {
    accountLinking: {
      // Drive accounts are often separate from the email used for TailCache.
      // Linking still requires an authenticated TailCache session and Google OAuth
      // confirmation; the TailCache account email is never changed by this.
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
      // Existing members can continue to sign in or link Google, but OAuth
      // must not become an invite-free registration path during beta.
      disableSignUp: true,
    },
  } : {},
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email') return;

      const email = typeof ctx.body?.email === 'string' ? ctx.body.email.trim().toLowerCase() : '';
      const inviteCode = ctx.request?.headers.get('x-pdam-invite-code')?.trim() ?? null;
      const existingUser = email ? await db.query.users.findFirst({ where: eq(schema.users.email, email) }) : null;
      if (existingUser) {
        throw new APIError('UNPROCESSABLE_ENTITY', { message: 'An account with this email already exists.' });
      }
      if (!email || !(await acceptInviteForEmail(inviteCode, email))) {
        throw new APIError('BAD_REQUEST', { message: 'A valid, available beta invite is required to create an account.' });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await attachAcceptedInviteToUser(user.id, user.email);
        },
      },
    },
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
      rpName: 'TailCache',
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

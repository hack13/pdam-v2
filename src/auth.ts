import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey } from '@better-auth/api-key';
import { db } from './db';
import * as schema from './db/schema';

export const auth = betterAuth({
  appName: 'PDAM',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      apikey: schema.apikey,
    },
  }),
  user: {
    modelName: 'user',
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
  ],
});

export type Session = typeof auth.$Infer.Session;

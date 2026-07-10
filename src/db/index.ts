import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const runtimeEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const connectionString = runtimeEnv?.DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const client = postgres(connectionString);

export const db = drizzle(client, { schema });
export type Database = typeof db;

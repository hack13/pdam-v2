import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../../db';
import { userStorageConnections } from '../../../db/schema';
import { requireAuth, json, jsonError } from '../../../lib/api-helpers';
import { encryptSyncSecret } from '../../../lib/sync-secrets';
import { createSyncDestination } from '../../../lib/sync-destinations';

export const GET: APIRoute = async (context) => {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const rows = await db.query.userStorageConnections.findMany({ where: eq(userStorageConnections.userId, auth.user.id), orderBy: [desc(userStorageConnections.createdAt)] });
  return json({ connections: rows.map(({ credentialsEncrypted: _, accessToken: __, refreshToken: ___, ...row }) => row) });
};
export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({})) as Record<string, unknown>;
  const providerType = String(body.providerType ?? '');
  if (!['s3', 'webdav'].includes(providerType)) return jsonError('Provider must be s3 or webdav');
  const name = String(body.name ?? '').trim();
  if (!name) return jsonError('Connection name is required');
  const credentials = providerType === 's3' ? {
    endpoint: String(body.endpoint ?? ''), region: String(body.region ?? 'auto'), bucket: String(body.bucket ?? ''), accessKeyId: String(body.accessKeyId ?? ''), secretAccessKey: String(body.secretAccessKey ?? ''), forcePathStyle: body.forcePathStyle !== false,
  } : { endpoint: String(body.endpoint ?? ''), username: String(body.username ?? ''), password: String(body.password ?? '') };
  if (Object.values(credentials).some((value) => value === '')) return jsonError('All destination fields are required');
  const [connection] = await db.insert(userStorageConnections).values({ userId: auth.user.id, providerType, providerName: name, externalAccountId: `${providerType}:${Date.now()}`, rootPath: body.rootPath ? String(body.rootPath) : null, credentialsEncrypted: encryptSyncSecret(JSON.stringify(credentials)), syncMode: 'snapshot' }).returning();
  try { await (await createSyncDestination(connection)).testConnection(); } catch (error) { await db.delete(userStorageConnections).where(eq(userStorageConnections.id, connection.id)); return jsonError(error instanceof Error ? error.message : 'Connection test failed', 400); }
  return json({ connection: { ...connection, credentialsEncrypted: undefined } }, 201);
};

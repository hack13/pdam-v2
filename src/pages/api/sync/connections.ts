import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../db';
import { accounts, userStorageConnections } from '../../../db/schema';
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
  if (!['s3', 'webdav', 'google-drive'].includes(providerType)) return jsonError('Provider must be s3, webdav, or google-drive');
  const name = String(body.name ?? '').trim();
  if (!name && providerType !== 'google-drive') return jsonError('Connection name is required');
  if (providerType === 'google-drive') {
    const googleAccount = await db.query.accounts.findFirst({
      where: and(eq(accounts.userId, auth.user.id), eq(accounts.providerId, 'google')),
      orderBy: [desc(accounts.updatedAt)],
    });
    const grantedScopes = googleAccount?.scope?.split(/[\s,]+/) ?? [];
    if (!googleAccount?.accessToken || !googleAccount.refreshToken || !grantedScopes.includes('https://www.googleapis.com/auth/drive.file')) {
      return jsonError('Connect Google Drive first and approve the requested permission.', 400);
    }
    const [connection] = await db.insert(userStorageConnections).values({
      userId: auth.user.id,
      providerType,
      providerName: 'Google Drive',
      externalAccountId: googleAccount.accountId,
      rootPath: body.rootPath ? String(body.rootPath) : 'TailCache Backups',
      credentialsEncrypted: encryptSyncSecret(JSON.stringify({
        accessToken: googleAccount.accessToken,
        refreshToken: googleAccount.refreshToken,
        accessTokenExpiresAt: googleAccount.accessTokenExpiresAt?.toISOString() ?? null,
      })),
      syncMode: 'snapshot',
    }).returning();
    try { await (await createSyncDestination(connection)).testConnection(); } catch (error) {
      await db.delete(userStorageConnections).where(eq(userStorageConnections.id, connection.id));
      return jsonError(error instanceof Error ? error.message : 'Google Drive connection test failed', 400);
    }
    return json({ connection: { ...connection, credentialsEncrypted: undefined } }, 201);
  }
  const credentials = providerType === 's3' ? {
    endpoint: String(body.endpoint ?? ''), region: String(body.region ?? 'auto').trim(), bucket: String(body.bucket ?? '').trim(), accessKeyId: String(body.accessKeyId ?? ''), secretAccessKey: String(body.secretAccessKey ?? ''), forcePathStyle: body.forcePathStyle !== false,
  } : { endpoint: String(body.endpoint ?? ''), username: String(body.username ?? ''), password: String(body.password ?? '') };
  if (Object.values(credentials).some((value) => value === '')) return jsonError('All destination fields are required');
  if (providerType === 's3') {
    try {
      const endpoint = new URL(credentials.endpoint);
      if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('unsupported protocol');
    } catch {
      return jsonError('S3 endpoint must be a valid http(s) URL, such as https://s3.example.com');
    }
  }
  const [connection] = await db.insert(userStorageConnections).values({ userId: auth.user.id, providerType, providerName: name, externalAccountId: `${providerType}:${Date.now()}`, rootPath: body.rootPath ? String(body.rootPath) : null, credentialsEncrypted: encryptSyncSecret(JSON.stringify(credentials)), syncMode: 'snapshot' }).returning();
  try { await (await createSyncDestination(connection)).testConnection(); } catch (error) { await db.delete(userStorageConnections).where(eq(userStorageConnections.id, connection.id)); return jsonError(error instanceof Error ? error.message : 'Connection test failed', 400); }
  return json({ connection: { ...connection, credentialsEncrypted: undefined } }, 201);
};

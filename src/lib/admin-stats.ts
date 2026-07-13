import { sql, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  users,
  products,
  creators,
  globalFileBlobs,
  userAssetFiles,
  blobStorageObjects,
  storageAccounting,
} from '../db/schema';

export interface AdminStats {
  totalUsers: number;
  totalAssets: number;
  totalUniqueFiles: number;
  totalCreators: number;
  totalLogicalBytes: number;
  totalPhysicalBytes: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const [userCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);

  const [assetCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products);

  const [uniqueFileCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(globalFileBlobs);

  const [creatorCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creators);

  const [logicalResult] = await db
    .select({
      total: sql<number>`coalesce(sum(${userAssetFiles.logicalSizeBytes}), 0)::bigint`,
    })
    .from(userAssetFiles);

  const [physicalResult] = await db
    .select({
      total: sql<number>`coalesce(sum(${blobStorageObjects.physicalSizeBytes}), 0)::bigint`,
    })
    .from(blobStorageObjects);

  return {
    totalUsers: userCount?.count ?? 0,
    totalAssets: assetCount?.count ?? 0,
    totalUniqueFiles: uniqueFileCount?.count ?? 0,
    totalCreators: creatorCount?.count ?? 0,
    totalLogicalBytes: Number(logicalResult?.total ?? 0),
    totalPhysicalBytes: Number(physicalResult?.total ?? 0),
  };
}

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  role: string;
  canGenerateInvites: boolean;
  inviteGenerationLimit: number;
  emailVerified: boolean;
  createdAt: Date;
  assetCount: number;
  logicalBytesUsed: number;
}

export async function getAdminUserSummaries(): Promise<AdminUserSummary[]> {
  const allUsers = await db.query.users.findMany({
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (allUsers.length === 0) return [];

  const assetCounts = await db
    .select({
      ownerUserId: products.ownerUserId,
      count: sql<number>`count(*)::int`,
    })
    .from(products)
    .groupBy(products.ownerUserId);

  const assetCountByUser = new Map(
    assetCounts
      .filter((row) => row.ownerUserId)
      .map((row) => [row.ownerUserId!, row.count]),
  );

  const storageRecords = await db.query.storageAccounting.findMany();
  const storageByUser = new Map(
    storageRecords.map((record) => [record.userId, record.logicalBytesUsed]),
  );

  return allUsers.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    canGenerateInvites: user.canGenerateInvites,
    inviteGenerationLimit: user.inviteGenerationLimit,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    assetCount: assetCountByUser.get(user.id) ?? 0,
    logicalBytesUsed: storageByUser.get(user.id) ?? 0,
  }));
}

export async function getAdminUserSummary(userId: string): Promise<AdminUserSummary | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) return null;

  const [assetCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.ownerUserId, userId));

  const storage = await db.query.storageAccounting.findFirst({
    where: eq(storageAccounting.userId, userId),
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    canGenerateInvites: user.canGenerateInvites,
    inviteGenerationLimit: user.inviteGenerationLimit,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    assetCount: assetCount?.count ?? 0,
    logicalBytesUsed: storage?.logicalBytesUsed ?? 0,
  };
}

import { db } from '../db';
import { storageAccounting, userAssetFiles, blobStorageObjects } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { formatBytes } from './format-bytes';

export { formatBytes };

export interface StorageUpdateParams {
  userId: string;
  logicalSizeDelta?: number;
  physicalSizeDelta?: number;
}

export async function updateStorageAccounting(params: StorageUpdateParams): Promise<void> {
  const { userId, logicalSizeDelta = 0, physicalSizeDelta = 0 } = params;

  // Get or create accounting record for user
  let accounting = await db.query.storageAccounting.findFirst({
    where: eq(storageAccounting.userId, userId),
  });

  if (!accounting) {
    // Create new accounting record
    await db.insert(storageAccounting).values({
      userId,
      logicalBytesUsed: logicalSizeDelta,
      physicalBytesUsed: physicalSizeDelta,
      updatedAt: new Date(),
    });
  } else {
    // Update existing record
    await db
      .update(storageAccounting)
      .set({
        logicalBytesUsed: accounting.logicalBytesUsed + logicalSizeDelta,
        physicalBytesUsed: accounting.physicalBytesUsed + physicalSizeDelta,
        updatedAt: new Date(),
      })
      .where(eq(storageAccounting.userId, userId));
  }
}

export async function getUserStorage(userId: string): Promise<{
  logicalBytesUsed: number;
  physicalBytesUsed: number;
} | null> {
  const accounting = await db.query.storageAccounting.findFirst({
    where: eq(storageAccounting.userId, userId),
  });

  if (!accounting) {
    return null;
  }

  return {
    logicalBytesUsed: accounting.logicalBytesUsed,
    physicalBytesUsed: accounting.physicalBytesUsed,
  };
}

export async function reconcileUserStorage(userId: string): Promise<{
  logicalBytesUsed: number;
  physicalBytesUsed: number;
}> {
  // Get all asset files for this user
  const userFiles = await db.query.userAssetFiles.findMany({
    where: eq(userAssetFiles.userId, userId),
  });

  // Calculate logical bytes (sum of all user's files)
  const logicalBytesUsed = userFiles.reduce((sum, f) => sum + Number(f.logicalSizeBytes), 0);

  // Get all unique blob IDs for this user
  const blobIds = Array.from(new Set(userFiles.map((f) => f.blobId)));

  // Calculate physical bytes by checking which blobs still have storage objects
  const storageObjs = blobIds.length > 0
    ? await db.query.blobStorageObjects.findMany({
        where: (table) => inArray(table.blobId, blobIds),
      })
    : [];

  const physicalBytesUsed = storageObjs.reduce((sum, obj) => 
    sum + Number(obj.physicalSizeBytes || 0), 0);

  // Update or create the accounting record
  await db.delete(storageAccounting).where(eq(storageAccounting.userId, userId));
  await db.insert(storageAccounting).values({
    userId,
    logicalBytesUsed,
    physicalBytesUsed,
    updatedAt: new Date(),
  });

  return { logicalBytesUsed, physicalBytesUsed };
}

export async function reconcileAllUsersStorage(): Promise<{
  userId: string;
  logicalBytesUsed: number;
  physicalBytesUsed: number;
}[]> {
  // Get all unique user IDs from userAssetFiles
  const allFiles = await db.query.userAssetFiles.findMany();
  const userIds = Array.from(new Set(allFiles.map((f) => f.userId)));

  const results = [];
  for (const userId of userIds) {
    const result = await reconcileUserStorage(userId);
    results.push({ userId, ...result });
  }

  return results;
}

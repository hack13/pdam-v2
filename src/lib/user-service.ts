import { eq } from 'drizzle-orm';
import { db } from '../db';
import {
  users,
  products,
  marketplaceSources,
  storageAccounting,
  apikey,
  userLibraryItems,
  userStorageConnections,
  creators,
} from '../db/schema';
import { deleteAsset } from './asset-service';
import { storage } from './storage';

export async function deleteUser(userId: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  const userProducts = await db.query.products.findMany({
    where: eq(products.ownerUserId, userId),
    columns: { id: true },
  });

  for (const product of userProducts) {
    await deleteAsset(product.id, userId);
  }

  await db.delete(userLibraryItems).where(eq(userLibraryItems.userId, userId));
  await db.delete(userStorageConnections).where(eq(userStorageConnections.userId, userId));
  await db.delete(marketplaceSources).where(eq(marketplaceSources.ownerUserId, userId));
  await db.delete(storageAccounting).where(eq(storageAccounting.userId, userId));
  await db.delete(apikey).where(eq(apikey.referenceId, userId));

  await db
    .update(creators)
    .set({ enrolledByUserId: null })
    .where(eq(creators.enrolledByUserId, userId));

  const avatarKey = `avatars/${userId}.webp`;
  try {
    await storage.delete(avatarKey);
  } catch {
    // ignore missing avatar
  }

  await db.delete(users).where(eq(users.id, userId));
}

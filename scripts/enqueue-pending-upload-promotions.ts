import 'dotenv/config';
import { and, eq, isNull, like } from 'drizzle-orm';
import { db } from '../src/db';
import { pendingUploads } from '../src/db/schema';
import { enqueueUploadPromotion, getSyncBoss } from '../src/lib/sync-queue';

const sessions = await db.query.pendingUploads.findMany({
  where: and(
    like(pendingUploads.storageKey, 'pending-uploads/%'),
    isNull(pendingUploads.promotionJobId),
    eq(pendingUploads.status, 'completed'),
  ),
});

let queued = 0;
for (const session of sessions) {
  await enqueueUploadPromotion(session.id);
  queued++;
}
console.info(`[upload-promotions] queued ${queued} completed staging upload(s)`);
await (await getSyncBoss()).stop({ graceful: true });

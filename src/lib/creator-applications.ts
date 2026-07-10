import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../db';
import {
  creatorApplications,
  creators,
  products,
  galleryPurchaseLinks,
  users,
  type CreatorApplication,
} from '../db/schema';
import { slugify } from './api-helpers';
import { getLinkedCreator } from './creator';

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export async function getLatestApplication(userId: string): Promise<CreatorApplication | null> {
  const row = await db.query.creatorApplications.findFirst({
    where: eq(creatorApplications.userId, userId),
    orderBy: [desc(creatorApplications.createdAt)],
  });
  return row ?? null;
}

export async function getPendingApplication(userId: string): Promise<CreatorApplication | null> {
  const row = await db.query.creatorApplications.findFirst({
    where: and(
      eq(creatorApplications.userId, userId),
      eq(creatorApplications.status, 'pending'),
    ),
    orderBy: [desc(creatorApplications.createdAt)],
  });
  return row ?? null;
}

async function resolveOrCreateCreator(params: {
  creatorId?: string | null;
  requestedCreatorName: string;
}): Promise<typeof creators.$inferSelect> {
  const name = params.requestedCreatorName.trim();
  if (!name) throw new Error('Creator name is required');

  if (params.creatorId) {
    const existing = await db.query.creators.findFirst({
      where: eq(creators.id, params.creatorId),
    });
    if (!existing) throw new Error('Creator not found');
    return existing;
  }

  const byName = await db.query.creators.findFirst({
    where: eq(creators.name, name),
  });
  if (byName) return byName;

  let slug = slugify(name);
  let counter = 0;
  while (true) {
    const slugTaken = await db.query.creators.findFirst({
      where: eq(creators.slug, slug),
    });
    if (!slugTaken) break;
    counter++;
    slug = `${slugify(name)}-${counter}`;
  }

  const [created] = await db.insert(creators).values({ name, slug }).returning();
  return created;
}

export async function submitCreatorApplication(params: {
  userId: string;
  creatorId?: string | null;
  requestedCreatorName: string;
  proofUrls?: string[];
  applicantNote?: string | null;
}): Promise<CreatorApplication> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, params.userId),
  });
  if (!user) throw new Error('User not found');
  if (user.role === 'creator' || user.role === 'admin') {
    const linked = await getLinkedCreator(params.userId);
    if (linked) {
      throw new Error('You already have an approved creator profile');
    }
  }

  const pending = await getPendingApplication(params.userId);
  if (pending) {
    throw new Error('You already have a pending creator application');
  }

  const name = params.requestedCreatorName.trim();
  if (!name) throw new Error('Creator name is required');
  if (name.length > 100) throw new Error('Creator name too long (max 100 chars)');

  let creatorId = params.creatorId ?? null;
  if (creatorId) {
    const target = await db.query.creators.findFirst({
      where: eq(creators.id, creatorId),
    });
    if (!target) throw new Error('Creator not found');
    if (target.enrolledByUserId && target.enrolledByUserId !== params.userId) {
      throw new Error('That creator profile is already linked to another account');
    }
  }

  const proofUrls = (params.proofUrls ?? [])
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 10);

  for (const url of proofUrls) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('invalid');
      }
    } catch {
      throw new Error(`Invalid proof URL: ${url}`);
    }
  }

  if (proofUrls.length === 0) {
    throw new Error('Add at least one proof URL (storefront, Gumroad, Jinxxy, etc.)');
  }

  const [row] = await db
    .insert(creatorApplications)
    .values({
      userId: params.userId,
      creatorId,
      requestedCreatorName: name,
      proofUrls,
      applicantNote: params.applicantNote?.trim() || null,
      status: 'pending',
    })
    .returning();

  return row;
}

export async function approveCreatorApplication(params: {
  applicationId: string;
  adminUserId: string;
  adminNote?: string | null;
}): Promise<CreatorApplication> {
  const application = await db.query.creatorApplications.findFirst({
    where: eq(creatorApplications.id, params.applicationId),
  });
  if (!application) throw new Error('Application not found');
  if (application.status !== 'pending') {
    throw new Error('Only pending applications can be approved');
  }

  const applicant = await db.query.users.findFirst({
    where: eq(users.id, application.userId),
  });
  if (!applicant) throw new Error('Applicant user not found');

  const creator = await resolveOrCreateCreator({
    creatorId: application.creatorId,
    requestedCreatorName: application.requestedCreatorName,
  });

  if (creator.enrolledByUserId && creator.enrolledByUserId !== application.userId) {
    throw new Error('That creator profile was claimed by someone else while this was pending');
  }

  // Clear any previous enrollment for this user (profile change applications)
  const previous = await getLinkedCreator(application.userId);
  if (previous && previous.id !== creator.id) {
    const listed = await db.query.products.findMany({
      where: and(
        eq(products.ownerUserId, application.userId),
        eq(products.isGalleryListed, true),
      ),
      columns: { id: true },
    });
    for (const listing of listed) {
      await db.delete(galleryPurchaseLinks).where(eq(galleryPurchaseLinks.productId, listing.id));
      await db
        .update(products)
        .set({ isGalleryListed: false, updatedAt: new Date() })
        .where(eq(products.id, listing.id));
    }
    await db
      .update(creators)
      .set({ enrolledByUserId: null, updatedAt: new Date() })
      .where(eq(creators.id, previous.id));
  }

  const [enrolled] = await db
    .update(creators)
    .set({
      enrolledByUserId: application.userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creators.id, creator.id),
        or(isNull(creators.enrolledByUserId), eq(creators.enrolledByUserId, application.userId)),
      ),
    )
    .returning();

  if (!enrolled) {
    throw new Error('Could not enroll creator profile — it may already be claimed');
  }

  if (applicant.role !== 'admin') {
    await db
      .update(users)
      .set({ role: 'creator', updatedAt: new Date() })
      .where(eq(users.id, application.userId));
  }

  const now = new Date();
  const [updated] = await db
    .update(creatorApplications)
    .set({
      status: 'approved',
      creatorId: creator.id,
      adminNote: params.adminNote?.trim() || null,
      reviewedByUserId: params.adminUserId,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(creatorApplications.id, application.id))
    .returning();

  return updated;
}

export async function rejectCreatorApplication(params: {
  applicationId: string;
  adminUserId: string;
  adminNote?: string | null;
}): Promise<CreatorApplication> {
  const application = await db.query.creatorApplications.findFirst({
    where: eq(creatorApplications.id, params.applicationId),
  });
  if (!application) throw new Error('Application not found');
  if (application.status !== 'pending') {
    throw new Error('Only pending applications can be rejected');
  }

  const now = new Date();
  const [updated] = await db
    .update(creatorApplications)
    .set({
      status: 'rejected',
      adminNote: params.adminNote?.trim() || null,
      reviewedByUserId: params.adminUserId,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(creatorApplications.id, application.id))
    .returning();

  return updated;
}

export async function cancelCreatorApplication(
  applicationId: string,
  userId: string,
): Promise<CreatorApplication> {
  const application = await db.query.creatorApplications.findFirst({
    where: and(
      eq(creatorApplications.id, applicationId),
      eq(creatorApplications.userId, userId),
    ),
  });
  if (!application) throw new Error('Application not found');
  if (application.status !== 'pending') {
    throw new Error('Only pending applications can be cancelled');
  }

  const [updated] = await db
    .update(creatorApplications)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
    })
    .where(eq(creatorApplications.id, application.id))
    .returning();

  return updated;
}

export async function listCreatorApplications(status?: string) {
  const rows = status
    ? await db.query.creatorApplications.findMany({
        where: eq(creatorApplications.status, status),
        orderBy: [desc(creatorApplications.createdAt)],
      })
    : await db.query.creatorApplications.findMany({
        orderBy: [desc(creatorApplications.createdAt)],
        limit: 200,
      });

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const creatorIds = [...new Set(rows.map((r) => r.creatorId).filter((id): id is string => !!id))];

  const applicants =
    userIds.length > 0
      ? await db.query.users.findMany({
          where: inArray(users.id, userIds),
        })
      : [];
  const catalogCreators =
    creatorIds.length > 0
      ? await db.query.creators.findMany({
          where: inArray(creators.id, creatorIds),
        })
      : [];

  const userMap = Object.fromEntries(applicants.map((u) => [u.id, u]));
  const creatorMap = Object.fromEntries(catalogCreators.map((c) => [c.id, c]));

  return rows.map((row) => ({
    ...row,
    applicant: userMap[row.userId]
      ? {
          id: userMap[row.userId].id,
          name: userMap[row.userId].name,
          email: userMap[row.userId].email,
          role: userMap[row.userId].role,
        }
      : null,
    catalogCreator: row.creatorId ? creatorMap[row.creatorId] ?? null : null,
  }));
}

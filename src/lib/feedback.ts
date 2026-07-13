import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { feedbackAttachments, feedbackItems, users } from '../db/schema';

export const FEEDBACK_CATEGORIES = ['bug', 'idea', 'general'] as const;
export const FEEDBACK_STATUSES = ['new', 'in_progress', 'resolved', 'closed'] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export function isFeedbackCategory(value: string): value is FeedbackCategory {
  return FEEDBACK_CATEGORIES.includes(value as FeedbackCategory);
}

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return FEEDBACK_STATUSES.includes(value as FeedbackStatus);
}

export async function listFeedback(status?: FeedbackStatus) {
  const rows = await db
    .select({
      feedback: feedbackItems,
      reporter: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(feedbackItems)
    .innerJoin(users, eq(feedbackItems.userId, users.id))
    .where(status ? eq(feedbackItems.status, status) : undefined)
    .orderBy(desc(feedbackItems.createdAt));

  const itemIds = rows.map((row) => row.feedback.id);
  const attachments = itemIds.length
    ? await db
        .select()
        .from(feedbackAttachments)
        .where(inArray(feedbackAttachments.feedbackId, itemIds))
        .orderBy(feedbackAttachments.createdAt)
    : [];

  const attachmentsByFeedbackId = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const files = attachmentsByFeedbackId.get(attachment.feedbackId) ?? [];
    files.push(attachment);
    attachmentsByFeedbackId.set(attachment.feedbackId, files);
  }

  return rows.map(({ feedback, reporter }) => ({
    ...feedback,
    reporter,
    attachments: (attachmentsByFeedbackId.get(feedback.id) ?? []).map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
    })),
  }));
}

export async function getFeedbackAttachment(feedbackId: string, attachmentId: string) {
  const [attachment] = await db
    .select()
    .from(feedbackAttachments)
    .where(and(eq(feedbackAttachments.id, attachmentId), eq(feedbackAttachments.feedbackId, feedbackId)));
  return attachment ?? null;
}

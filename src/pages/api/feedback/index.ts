import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { feedbackAttachments, feedbackItems } from '../../../db/schema';
import { json, jsonError, requireAuth } from '../../../lib/api-helpers';
import { isFeedbackCategory } from '../../../lib/feedback';
import { storage } from '../../../lib/storage';

const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024;

function safeFileName(fileName: string) {
  const cleaned = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  return cleaned.slice(-120) || 'screenshot';
}

export const POST: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return jsonError('Please submit feedback using the form.');
  }

  const message = String(form.get('message') ?? '').trim();
  const category = String(form.get('category') ?? 'general');
  const pageUrl = String(form.get('pageUrl') ?? '').trim();
  const screenshots = form
    .getAll('screenshots')
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (message.length < 3) return jsonError('Please add a little more detail.');
  if (message.length > 5000) return jsonError('Feedback must be 5,000 characters or fewer.');
  if (!isFeedbackCategory(category)) return jsonError('Feedback category is invalid.');
  if (pageUrl.length > 2048) return jsonError('Page URL is too long.');
  if (screenshots.length > MAX_SCREENSHOTS) {
    return jsonError(`Attach up to ${MAX_SCREENSHOTS} screenshots.`);
  }

  for (const file of screenshots) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      return jsonError('Screenshots must be PNG, JPG, or WebP images.');
    }
    if (file.size > MAX_SCREENSHOT_SIZE) {
      return jsonError('Each screenshot must be 10MB or smaller.');
    }
  }

  const [feedback] = await db
    .insert(feedbackItems)
    .values({
      userId: auth.user.id,
      category,
      message,
      pageUrl: pageUrl || null,
    })
    .returning({ id: feedbackItems.id });

  const uploadedKeys: string[] = [];
  try {
    for (const file of screenshots) {
      const id = randomUUID();
      const fileName = safeFileName(file.name);
      const storageKey = `feedback/${feedback.id}/${id}-${fileName}`;
      await storage.put(storageKey, Buffer.from(await file.arrayBuffer()));
      uploadedKeys.push(storageKey);
      await db.insert(feedbackAttachments).values({
        id,
        feedbackId: feedback.id,
        fileName,
        mimeType: file.type,
        fileSize: file.size,
        storageKey,
      });
    }
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((key) => storage.delete(key)));
    await db.delete(feedbackItems).where(eq(feedbackItems.id, feedback.id));
    console.error('Failed to save feedback attachments', error);
    return jsonError('We could not save your screenshots. Please try again.', 500);
  }

  return json({ feedback: { id: feedback.id }, message: 'Feedback received.' }, 201);
};

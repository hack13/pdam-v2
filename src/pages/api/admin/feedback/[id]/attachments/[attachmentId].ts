import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../../../../lib/admin';
import { jsonError } from '../../../../../../lib/api-helpers';
import { getFeedbackAttachment } from '../../../../../../lib/feedback';
import { storage } from '../../../../../../lib/storage';

export const GET: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (admin instanceof Response) return admin;

  const feedbackId = context.params.id;
  const attachmentId = context.params.attachmentId;
  if (!feedbackId || !attachmentId) return jsonError('Attachment not found.', 404);

  const attachment = await getFeedbackAttachment(feedbackId, attachmentId);
  if (!attachment) return jsonError('Attachment not found.', 404);

  try {
    const data = await storage.get(attachment.storageKey);
    // Copy into a standard ArrayBuffer so the response body stays portable
    // across Astro's Node and fetch type implementations.
    const body = Uint8Array.from(data).buffer;
    return new Response(body, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(attachment.fileSize),
        'Content-Disposition': `inline; filename="${attachment.fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return jsonError('The attachment file is unavailable.', 404);
  }
};

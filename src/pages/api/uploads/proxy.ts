import type { APIRoute } from 'astro';
import { requireAuth, jsonError } from '../../../lib/api-helpers';
import { getConfiguredStorageOrigin } from '../../../lib/storage';

export const PUT: APIRoute = async (context) => {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const targetParam = new URL(context.request.url).searchParams.get('url');
  if (!targetParam) return jsonError('Upload URL is required');

  let target: URL;
  try {
    target = new URL(targetParam);
  } catch {
    return jsonError('Upload URL is invalid');
  }

  const configuredOrigin = getConfiguredStorageOrigin();
  if (!configuredOrigin || target.origin !== configuredOrigin) {
    return jsonError('Upload URL is not allowed', 403);
  }

  const body = await context.request.arrayBuffer();
  const response = await fetch(target, {
    method: 'PUT',
    body,
    headers: {
      'Content-Type': context.request.headers.get('content-type') ?? 'application/octet-stream',
    },
  });

  const headers = new Headers();
  const etag = response.headers.get('etag');
  if (etag) headers.set('ETag', etag);

  if (!response.ok) {
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers,
    });
  }

  return new Response(null, { status: response.status, headers });
};

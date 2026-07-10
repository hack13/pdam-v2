import { auth } from '../auth';
import type { APIContext } from 'astro';
import { validateRequestOrigin } from './request-security';

export async function getSessionFromContext(context: APIContext) {
  if (!validateRequestOrigin(context)) return null;

  const session = await auth.api.getSession({
    headers: context.request.headers,
  });
  return session;
}

import { auth } from '../auth';
import type { APIContext } from 'astro';

export async function getSessionFromContext(context: APIContext) {
  const session = await auth.api.getSession({
    headers: context.request.headers,
  });
  return session;
}

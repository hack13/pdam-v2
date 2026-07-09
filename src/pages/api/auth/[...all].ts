import type { APIRoute } from 'astro';
import { auth } from '../../../auth';

export const ALL: APIRoute = async (context) => {
  const handler = auth.handler;
  return handler(context.request);
};

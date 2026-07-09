import type { APIRoute } from 'astro';
import { buildOpenApiSpec } from '../../lib/openapi';

export const GET: APIRoute = (context) => {
  const origin = new URL(context.request.url).origin;
  const spec = buildOpenApiSpec(origin);

  return new Response(JSON.stringify(spec), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
};

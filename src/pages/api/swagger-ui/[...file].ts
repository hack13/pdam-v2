import type { APIRoute } from 'astro';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const require = createRequire(import.meta.url);
// swagger-ui-dist exposes the absolute path to its static assets.
const distPath: string = require('swagger-ui-dist').getAbsoluteFSPath();

// Only these files are ever served, to prevent path traversal / arbitrary reads.
const ALLOWED: Record<string, string> = {
  'swagger-ui.css': 'text/css; charset=utf-8',
  'index.css': 'text/css; charset=utf-8',
  'swagger-ui-bundle.js': 'application/javascript; charset=utf-8',
  'swagger-ui-standalone-preset.js': 'application/javascript; charset=utf-8',
};

export const GET: APIRoute = async (context) => {
  const requested = context.params.file ?? '';
  const contentType = ALLOWED[requested];

  if (!contentType) {
    return new Response('Not found', { status: 404 });
  }

  const fullPath = normalize(join(distPath, requested));
  if (!fullPath.startsWith(distPath)) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const data = await readFile(fullPath);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
};

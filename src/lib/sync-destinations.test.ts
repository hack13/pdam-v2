import { beforeAll, describe, expect, it } from 'vitest';

let parseNextcloudEndpoint: typeof import('./sync-destinations').parseNextcloudEndpoint;
let nextcloudChunkName: typeof import('./sync-destinations').nextcloudChunkName;
let networkError: typeof import('./sync-destinations').networkError;

beforeAll(async () => {
  // Importing destination code also creates the database client. No query is
  // made in these protocol-only tests, but the client needs a valid URL.
  process.env.DATABASE_URL ??= 'postgresql://postgres:password@127.0.0.1:5432/tailcache_test';
  ({ parseNextcloudEndpoint, nextcloudChunkName, networkError } = await import('./sync-destinations'));
});

describe('Nextcloud destination protocol', () => {
  it('derives file and upload collection URLs from an authenticated DAV collection', () => {
    const endpoint = parseNextcloudEndpoint(new URL('https://cloud.example.com/nextcloud/remote.php/dav/files/alice/'));
    expect(endpoint.user).toBe('alice');
    expect(endpoint.filesBase.toString()).toBe('https://cloud.example.com/nextcloud/remote.php/dav/files/alice/');
    expect(endpoint.uploadsBase.toString()).toBe('https://cloud.example.com/nextcloud/remote.php/dav/uploads/alice/');
  });

  it('rejects a non-collection Nextcloud URL', () => {
    expect(() => parseNextcloudEndpoint(new URL('https://cloud.example.com/remote.php/dav/'))).toThrow(/collection URL/);
  });

  it('uses lexically sortable inclusive chunk byte ranges', () => {
    expect(nextcloudChunkName(0, 67_108_863)).toBe('000000000000000-000000067108863');
    expect(nextcloudChunkName(67_108_864, 100_000_000)).toBe('000000067108864-000000100000000');
  });

  it('keeps a safe transport error code in network diagnostics', () => {
    const error = new TypeError('fetch failed', { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });
    expect(networkError(error).message).toBe('Destination network request failed (ECONNRESET)');
  });
});

import { beforeAll, describe, expect, it } from 'vitest';

let safeSyncFileName: typeof import('./sync-manifest').safeSyncFileName;
let syncAssetFilePath: typeof import('./sync-manifest').syncAssetFilePath;
let syncThumbnailPath: typeof import('./sync-manifest').syncThumbnailPath;
let findConflictingSyncPaths: typeof import('./sync-manifest').findConflictingSyncPaths;
let disambiguateSyncPaths: typeof import('./sync-manifest').disambiguateSyncPaths;
let buildArchiveHtml: typeof import('./archive-html').buildArchiveHtml;

beforeAll(async () => {
  // sync-manifest imports the Drizzle client but these path-only tests do not
  // make a database query.
  process.env.DATABASE_URL ??= 'postgresql://postgres:password@127.0.0.1:5432/tailcache_test';
  ({ safeSyncFileName, syncAssetFilePath, syncThumbnailPath, findConflictingSyncPaths, disambiguateSyncPaths } = await import('./sync-manifest'));
  ({ buildArchiveHtml } = await import('./archive-html'));
});

describe('backup export layout', () => {
  it('writes files and thumbnails directly beneath the configured destination root', () => {
    const root = 'backups/me';
    expect(`${root}/${syncAssetFilePath('neon-kit', 'v1.2.0', 'readme.pdf')}`).toBe('backups/me/assets/neon-kit/v1.2.0/readme.pdf');
    expect(`${root}/${syncThumbnailPath('3e8d074a-9eb4-433e-a723-663e52d17b97')}`).toBe('backups/me/archive-thumbs/3e8d074a-9eb4-433e-a723-663e52d17b97.webp');
    expect(`${root}/Archive.html`).toBe('backups/me/Archive.html');
  });

  it('keeps unsafe path separators out of exported filenames', () => {
    expect(safeSyncFileName('../private\\notes.txt')).toBe('.._private_notes.txt');
  });

  it('keeps colliding filenames distinct with a deterministic content-hash suffix', () => {
    const inputs = [
      { path: 'assets/neon/v1/guide.pdf', sha256: 'a' },
      { path: 'assets/neon/v1/guide.pdf', sha256: 'b' },
      { path: 'assets/neon/v1/readme.txt', sha256: 'c' },
    ];
    const conflicts = findConflictingSyncPaths(inputs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toHaveLength(2);
    expect(disambiguateSyncPaths(inputs).map((item) => item.path)).toEqual([
      'assets/neon/v1/guide--a.pdf',
      'assets/neon/v1/guide--b.pdf',
      'assets/neon/v1/readme.txt',
    ]);
  });

  it('renders Archive.html with links to the corrected root-level layout', () => {
    const archive = buildArchiveHtml({
      generatedAt: '2026-07-17T12:00:00.000Z',
      assets: [{
        id: 'asset-1', title: 'Neon kit', slug: 'neon-kit', descriptionHtml: null, descriptionText: null, tags: [], licenseKey: null,
        thumbnailPath: 'archive-thumbs/thumb-1.webp', thumbnail: null, updatedAt: '2026-07-17T12:00:00.000Z',
        versions: [{ id: 'version-1', version: 'v1', releaseNotes: null, publishedAt: null, createdAt: '2026-07-17T12:00:00.000Z', files: [{ id: 'file-1', blobId: 'blob-1', sha256: 'abc', fileName: 'guide.pdf', path: 'assets/neon-kit/v1/guide.pdf', mimeType: 'application/pdf', byteSize: 12, assetId: 'asset-1', versionId: 'version-1', downloadUrl: '' }] }],
      }],
      nextCursor: null,
      hasMore: false,
    } as never);

    expect(archive).toContain('src="archive-thumbs/thumb-1.webp"');
    expect(archive).toContain('href="assets/neon-kit/v1/guide.pdf"');
    expect(archive).not.toContain('tailcache/v2');
  });
});

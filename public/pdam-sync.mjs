#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const baseUrl = process.env.PDAM_URL ?? process.argv[2];
const token = process.env.PDAM_SYNC_TOKEN ?? process.argv[3];
const root = process.env.PDAM_SYNC_DIR ?? process.argv[4] ?? './pdam-backup';
if (!baseUrl || !token) { console.error('Usage: pdam-sync.mjs <PDAM_URL> <SYNC_TOKEN> [DIRECTORY]'); process.exit(2); }
const headers = { Authorization: `Bearer ${token}` };
const safeFileName = (name) => name.replace(/[\\/]/g, '_').replace(/^\.+$/, '_');
const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/sync/manifest`, { headers });
if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
const manifest = await response.json();
let failed = 0;
for (const asset of manifest.assets) for (const version of asset.versions) for (const file of version.files) {
  const target = join(root, 'assets', asset.slug, 'versions', version.version, 'files', safeFileName(file.fileName));
  try { const existing = await readFile(target); if (createHash('sha256').update(existing).digest('hex') === file.sha256) continue; } catch {}
  const fileResponse = await fetch(`${baseUrl.replace(/\/$/, '')}${file.downloadUrl}`, { headers });
  if (!fileResponse.ok) { console.error(`Failed ${file.fileName}: ${fileResponse.status}`); failed++; continue; }
  const data = Buffer.from(await fileResponse.arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== file.sha256) { console.error(`Hash mismatch ${file.fileName}`); failed++; continue; }
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.part-${process.pid}`; await writeFile(temp, data); await rename(temp, target);
}
await mkdir(root, { recursive: true });
await writeFile(join(root, '.pdam-manifest.json'), JSON.stringify(manifest, null, 2));
if (failed) process.exit(1);
console.log(`Synced ${manifest.assets.length} asset(s) to ${root}`);

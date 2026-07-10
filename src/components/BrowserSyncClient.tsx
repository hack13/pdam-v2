import { useState } from 'react';

export function BrowserSyncClient() {
  const [baseUrl, setBaseUrl] = useState(window.location.origin);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [manifest, setManifest] = useState<any>(null);
  const safeFileName = (name: string) => name.replace(/[\\/]/g, '_').replace(/^\.+$/, '_');

  async function syncToFolder() {
    setStatus('Loading manifest…');
    const headers = { Authorization: `Bearer ${token}` };
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/sync/manifest`, { headers });
    if (!response.ok) { setStatus(`Manifest request failed (${response.status})`); return; }
    const data = await response.json(); setManifest(data);
    if (!('showDirectoryPicker' in window)) { setStatus('This browser does not support folder sync. Use the Node script below or download the individual files.'); return; }
    // File System Access is intentionally feature-detected so Firefox/Safari can still use the manifest.
    // @ts-expect-error browser API is not in all TypeScript lib targets
    const directory = await window.showDirectoryPicker({ mode: 'readwrite' });
    let completed = 0;
    for (const asset of data.assets) for (const version of asset.versions) for (const file of version.files) {
      const assetDir = await directory.getDirectoryHandle('assets', { create: true });
      const targetDir = await assetDir.getDirectoryHandle(asset.slug, { create: true });
      const versionDir = await targetDir.getDirectoryHandle('versions', { create: true });
      const filesDir = await versionDir.getDirectoryHandle(version.version, { create: true }).then((handle: any) => handle.getDirectoryHandle('files', { create: true }));
      const handle = await filesDir.getFileHandle(safeFileName(file.fileName), { create: true });
      const writable = await handle.createWritable();
      const fileResponse = await fetch(`${baseUrl.replace(/\/$/, '')}${file.downloadUrl}`, { headers });
      if (!fileResponse.ok) throw new Error(`Download failed (${fileResponse.status})`);
      await writable.write(await fileResponse.arrayBuffer()); await writable.close(); completed++;
      setStatus(`Synced ${completed} file(s)…`);
    }
    setStatus(`Sync complete: ${completed} file(s).`);
  }

  return <div className="mx-auto max-w-2xl rounded-xl border border-white/10 bg-white/5 p-6"><h1 className="text-2xl font-bold text-white">Local sync</h1><p className="mt-2 text-sm text-zinc-400">Use a scoped sync token to copy your library to a local folder. Files are never deleted.</p><div className="mt-5 space-y-3"><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="PDAM URL" className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /><input value={token} onChange={(event) => setToken(event.target.value)} placeholder="pdam_sync_…" type="password" className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /><button disabled={!token} onClick={() => void syncToFolder()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Choose folder &amp; sync</button></div>{status && <p className="mt-4 text-sm text-indigo-200">{status}</p>}{manifest && !('showDirectoryPicker' in window) && <div className="mt-4 rounded-lg border border-white/10 p-3 text-sm text-zinc-300"><a href="/pdam-sync.mjs" download className="text-indigo-300">Download the Node sync script</a> for reliable cross-browser folder sync.</div>}</div>;
}

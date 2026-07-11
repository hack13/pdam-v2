import { useEffect, useState } from 'react';

export function BrowserSyncClient() {
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [supportsDirectoryPicker, setSupportsDirectoryPicker] = useState(false);
  const [isChromiumBased, setIsChromiumBased] = useState<boolean | null>(null);
  const safeFileName = (name: string) => name.replace(/[\\/]/g, '_').replace(/^\.+$/, '_');

  useEffect(() => {
    const userAgent = navigator.userAgent;
    setBaseUrl(window.location.origin);
    setSupportsDirectoryPicker('showDirectoryPicker' in window);
    setIsChromiumBased(/Chrome|Chromium|Edg\/|OPR\/|Brave|Vivaldi/i.test(userAgent));
  }, []);

  async function syncToFolder() {
    setStatus('Loading manifest…');
    const headers = { Authorization: `Bearer ${token}` };
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/sync/manifest`, { headers });
    if (!response.ok) { setStatus(`Manifest request failed (${response.status})`); return; }
    const data = await response.json();
    const totalFiles = data.assets.reduce(
      (total: number, asset: any) => total + asset.versions.reduce(
        (versionTotal: number, version: any) => versionTotal + version.files.length,
        0,
      ),
      0,
    );
    setProgress({ completed: 0, total: totalFiles });
    if (!supportsDirectoryPicker) { setStatus('This browser does not support direct folder sync. Open the Python Sync tab to download the script.'); return; }
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
      setProgress({ completed, total: totalFiles });
      setStatus(`Synced ${completed} file(s)…`);
    }
    setStatus(`Sync complete: ${completed} file(s).`);
  }

  const progressPercent = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return <div className="mx-auto max-w-2xl rounded-xl border border-white/10 bg-white/5 p-6"><h1 className="text-2xl font-bold text-white">Local sync</h1><p className="mt-2 text-sm text-zinc-400">Use a scoped sync token to copy your library to a local folder. Files are never deleted.</p>{isChromiumBased === false && <div className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100" role="status"><p className="font-medium">Your browser may not support direct folder sync.</p><p className="mt-1 text-amber-200/80">Open the Python Sync tab above to download the fallback script.</p></div>}<div className="mt-5 space-y-3"><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="PDAM URL" className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /><input value={token} onChange={(event) => setToken(event.target.value)} placeholder="pdam_sync_…" type="password" className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" /><button disabled={!token} onClick={() => void syncToFolder()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Choose folder &amp; sync</button></div>{progress && progress.total > 0 && <div className="mt-5" aria-live="polite"><div className="mb-2 flex items-center justify-between text-xs text-zinc-400"><span>Sync progress</span><span>{progress.completed} of {progress.total} files ({progressPercent}%)</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.completed} aria-label="Sync progress"><div className="h-full rounded-full bg-indigo-500 transition-[width] duration-300" style={{ width: `${progressPercent}%` }} /></div></div>}{status && <p className="mt-4 text-sm text-indigo-200">{status}</p>}</div>;
}

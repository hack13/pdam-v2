import { useState } from 'react';

export function HtmlArchiveExport() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function exportArchive() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/sync/exports', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not build archive.html.');
      const url = URL.createObjectURL(new Blob([data.archiveHtml], { type: 'text/html;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'archive.html';
      link.click();
      URL.revokeObjectURL(url);
      setMessage('Downloaded archive.html');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not build archive.html.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="border border-dashed border-emerald-300/30 bg-emerald-950/20 p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-300">local index</p>
        <h2 className="mt-2 font-serif text-2xl text-white">archive.html</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">A small, old-school page for browsing the backup folder. It is included automatically in future syncs, with each asset’s thumbnail copied beside its files.</p>
      </div>
      <button type="button" onClick={() => void exportArchive()} disabled={busy} className="border border-emerald-300/40 bg-emerald-300/10 px-3 py-2 font-mono text-xs text-emerald-200 hover:bg-emerald-300/20 disabled:opacity-50">{busy ? 'building...' : 'preview / download'}</button>
    </div>
    {message && <p className="mt-3 font-mono text-xs text-emerald-300" role="status">{message}</p>}
  </section>;
}

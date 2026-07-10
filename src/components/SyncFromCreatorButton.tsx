import { useState } from 'react';

interface Props {
  productId: string;
  lastSyncedAt: string | null;
}

export function SyncFromCreatorButton({ productId, lastSyncedAt }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSync() {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch(`/api/assets/${productId}/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setMessage(data.message || 'Synced');
      if (data.addedVersions > 0 || data.addedFiles > 0) {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-indigo-200">Linked from creator listing</p>
          <p className="mt-0.5 text-xs text-zinc-400">
            You can download files and pull updates. Editing the creator&apos;s original is not
            allowed.
            {lastSyncedAt
              ? ` Last synced ${new Date(lastSyncedAt).toLocaleString()}.`
              : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={loading}
          className="rounded-lg border border-indigo-500/30 bg-indigo-500/20 px-3 py-1.5 text-sm font-medium text-indigo-200 transition-colors hover:bg-indigo-500/30 disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Check for updates'}
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-emerald-400">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

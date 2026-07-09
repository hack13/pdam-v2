import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  assetId: string;
  assetTitle: string;
}

export function DeleteAssetButton({ assetId, assetTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (!assetId) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/assets/${assetId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Failed to delete asset');
      }
      window.location.href = '/dashboard';
    } catch {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-300 transition-colors hover:border-red-500/50 hover:bg-red-500/20 hover:text-red-200"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V3a1 1 0 011-1h6a1 1 0 011 1v4" />
        </svg>
        Delete
      </button>

      {open && (
        <ConfirmDialog
          title="Delete Asset"
          confirmLabel="Delete"
          loading={loading}
          onClose={() => !loading && setOpen(false)}
          onConfirm={handleConfirm}
          message={
            <>
              Are you sure you want to delete <span className="font-medium text-white">"{assetTitle}"</span>?
            </>
          }
          description="This will permanently remove all versions, files, and the thumbnail. This action cannot be undone."
        />
      )}
    </>
  );
}

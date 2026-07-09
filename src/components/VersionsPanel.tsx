import { useState } from 'react';
import { FileUploader } from './FileUploader';

interface Version {
  id: string;
  version: string;
  releaseNotes: string | null;
  publishedAt: string | null;
  createdAt: string;
  files: { id: string; fileName: string; fileSize: number; mimeType: string }[];
}

interface Props {
  productId: string;
  initialVersions: Version[];
}

export function VersionsPanel({ productId, initialVersions }: Props) {
  const [versions, setVersions] = useState<Version[]>(initialVersions);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  async function refreshVersions() {
    const res = await fetch(`/api/assets/${productId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { versions: Version[] };
    setVersions(data.versions);
    setRefreshKey((k) => k + 1);
  }

  async function handleCreateVersion(version: string, releaseNotes: string) {
    const res = await fetch(`/api/assets/${productId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, releaseNotes }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? 'Failed to create version');
    }
    await refreshVersions();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Versions</h2>
        <button
          type="button"
          onClick={() => setShowAddDialog(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/10"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Version
        </button>
      </div>

      {versions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center">
          <svg className="mx-auto h-10 w-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="mt-3 text-base font-medium text-white">No versions yet</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Add a version to start uploading files for this asset.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...versions].reverse().map((version) => (
            <details
              key={`${version.id}-${refreshKey}`}
              open
              className="group rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between px-5 py-4 list-none">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-xs font-bold text-indigo-300">
                    v
                  </span>
                  <div>
                    <span className="font-medium text-white">{version.version}</span>
                    {version.publishedAt && (
                      <span className="ml-2 text-xs text-zinc-500">
                        {new Date(version.publishedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <svg className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="border-t border-white/5 px-5 py-4">
                {version.releaseNotes && (
                  <p className="mb-3 text-sm whitespace-pre-wrap text-zinc-400">{version.releaseNotes}</p>
                )}
                <FileUploader
                  key={version.id}
                  productId={productId}
                  versionId={version.id}
                  existingFiles={version.files}
                  onFilesUploaded={refreshVersions}
                />
              </div>
            </details>
          ))}
        </div>
      )}

      {showAddDialog && (
        <AddVersionDialog
          onClose={() => setShowAddDialog(false)}
          onCreate={async (version, releaseNotes) => {
            await handleCreateVersion(version, releaseNotes);
            setShowAddDialog(false);
          }}
        />
      )}
    </div>
  );
}

function AddVersionDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (version: string, releaseNotes: string) => Promise<void>;
}) {
  const [version, setVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!version.trim()) {
      setError('Version name is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onCreate(version.trim(), releaseNotes.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Add Version</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="version" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Version
            </label>
            <input
              id="version"
              type="text"
              required
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-white/10"
              placeholder="1.0"
            />
          </div>

          <div>
            <label htmlFor="releaseNotes" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Release Notes <span className="text-zinc-600">(optional)</span>
            </label>
            <textarea
              id="releaseNotes"
              rows={3}
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-white/10"
              placeholder="What changed in this version?"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Version'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

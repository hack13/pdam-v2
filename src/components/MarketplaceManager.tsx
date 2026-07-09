import { useState, useEffect } from 'react';

interface MarketplaceSource {
  id: string;
  name: string;
  slug: string;
  baseUrl: string | null;
  isUserDefined: boolean;
  ownerUserId: string | null;
  canEdit: boolean;
}

export function MarketplaceManager() {
  const [marketplaces, setMarketplaces] = useState<MarketplaceSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMarketplaces();
  }, []);

  async function fetchMarketplaces() {
    try {
      const res = await fetch('/api/marketplace-sources');
      const data = await res.json();
      setMarketplaces(data);
    } catch (err) {
      setError('Failed to load marketplaces');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/marketplace-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          baseUrl: baseUrl.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create marketplace');
      }

      setName('');
      setBaseUrl('');
      setShowForm(false);
      fetchMarketplaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create marketplace');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this marketplace? Any assets using it will remain but lose their marketplace association.')) {
      return;
    }

    try {
      const res = await fetch(`/api/marketplace-sources/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete marketplace');
      }

      fetchMarketplaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete marketplace');
    }
  }

  if (loading) {
    return <div className="text-zinc-400">Loading...</div>;
  }

  const platformMarketplaces = marketplaces.filter((m) => !m.isUserDefined);
  const userMarketplaces = marketplaces.filter((m) => m.isUserDefined);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-white">Marketplaces</h3>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            + Add custom
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 rounded-lg bg-zinc-800/50 border border-white/10">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., My Custom Store"
                required
                maxLength={100}
                className="w-full rounded bg-zinc-900 border border-white/10 px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Base URL <span className="text-zinc-500 text-xs">(optional)</span>
              </label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://example.com"
                maxLength={500}
                className="w-full rounded bg-zinc-900 border border-white/10 px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Adding...' : 'Add Marketplace'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setName('');
                  setBaseUrl('');
                  setError('');
                }}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-medium text-zinc-400 mb-2">Platform Marketplaces</h4>
          <div className="space-y-2">
            {platformMarketplaces.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30 border border-white/5"
              >
                <div>
                  <div className="font-medium text-white">{m.name}</div>
                  {m.baseUrl && (
                    <div className="text-xs text-zinc-500 mt-0.5">{m.baseUrl}</div>
                  )}
                </div>
                <span className="text-xs text-zinc-500 px-2 py-1 rounded bg-zinc-700/50">
                  Platform
                </span>
              </div>
            ))}
          </div>
        </div>

        {userMarketplaces.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-zinc-400 mb-2">Your Custom Marketplaces</h4>
            <div className="space-y-2">
              {userMarketplaces.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30 border border-white/5"
                >
                  <div>
                    <div className="font-medium text-white">{m.name}</div>
                    {m.baseUrl && (
                      <div className="text-xs text-zinc-500 mt-0.5">{m.baseUrl}</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="text-sm text-red-400 hover:text-red-300 px-3 py-1 rounded border border-red-500/20 hover:border-red-500/40 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

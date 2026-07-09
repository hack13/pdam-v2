import { useState, useEffect } from 'react';
import { authClient } from '../lib/auth-client';

interface ApiKey {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  enabled: boolean;
  expiresAt: string | Date | null;
  createdAt: string | Date;
  lastRequest: string | Date | null;
}

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiresIn, setNewKeyExpiresIn] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await authClient.apiKey.list({
        query: { sortBy: 'createdAt', sortDirection: 'desc' },
      });
      if (error) {
        setError(error.message ?? 'Failed to fetch API keys');
        return;
      }
      setKeys((data?.apiKeys ?? []) as unknown as ApiKey[]);
    } catch {
      setError('Failed to fetch API keys');
    } finally {
      setLoading(false);
    }
  }

  async function createKey() {
    if (!newKeyName.trim()) return;
    setError(null);
    setGeneratedKey(null);

    let expiresIn: number | undefined;
    if (newKeyExpiresIn) {
      const days = parseInt(newKeyExpiresIn, 10);
      if (isNaN(days) || days < 1) {
        setError('Expiration must be at least 1 day');
        return;
      }
      expiresIn = days * 24 * 60 * 60;
    }

    try {
      const { data, error } = await authClient.apiKey.create({
        name: newKeyName.trim(),
        ...(expiresIn !== undefined ? { expiresIn } : {}),
      });
      if (error) {
        setError(error.message ?? 'Failed to create API key');
        return;
      }
      setGeneratedKey(data?.key ?? null);
      setNewKeyName('');
      setNewKeyExpiresIn('');
      setShowCreateForm(false);
      await fetchKeys();
    } catch {
      setError('Failed to create API key');
    }
  }

  async function deleteKey(keyId: string) {
    setError(null);
    try {
      const { error } = await authClient.apiKey.delete({ keyId });
      if (error) {
        setError(error.message ?? 'Failed to delete API key');
        return;
      }
      await fetchKeys();
    } catch {
      setError('Failed to delete API key');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">API Keys</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Use these to authenticate with the{' '}
            <a href="/api-docs" className="text-indigo-400 hover:text-indigo-300">API</a>.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {showCreateForm ? 'Cancel' : 'Generate New Key'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {generatedKey && (
        <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-4 py-3">
          <p className="text-sm font-medium text-yellow-300">
            Your new API key has been created. Copy it now — you won't see it again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded bg-black/30 px-3 py-2 font-mono text-sm break-all text-yellow-200">
              {generatedKey}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(generatedKey)}
              className="rounded bg-yellow-500/20 px-3 py-2 text-sm text-yellow-300 hover:bg-yellow-500/30"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {showCreateForm && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-zinc-400">Key name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Production key"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400">
                Expires in (days, optional)
              </label>
              <input
                type="number"
                value={newKeyExpiresIn}
                onChange={(e) => setNewKeyExpiresIn(e.target.value)}
                placeholder="e.g. 90"
                min="1"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              onClick={createKey}
              disabled={!newKeyName.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Create Key
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading API keys...</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-zinc-500">No API keys yet. Generate one to get started.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{key.name ?? 'Unnamed key'}</p>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">
                  {key.start || 'pdam_••••'}
                </p>
                <div className="mt-1 flex gap-3 text-xs text-zinc-500">
                  <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                  {key.expiresAt && (
                    <span>Expires {new Date(key.expiresAt).toLocaleDateString()}</span>
                  )}
                  {key.lastRequest && (
                    <span>Last used {new Date(key.lastRequest).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <div className="ml-4 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    key.enabled
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {key.enabled ? 'Active' : 'Disabled'}
                </span>
                <button
                  onClick={() => deleteKey(key.id)}
                  className="rounded p-1 text-zinc-500 hover:text-red-400"
                  title="Revoke key"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

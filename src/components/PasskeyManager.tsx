import { useEffect, useState } from 'react';
import { authClient } from '../lib/auth-client';

interface UserPasskey {
  id: string;
  name?: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt?: string | Date | null;
  aaguid?: string | null;
}

function passkeyLabel(passkey: UserPasskey) {
  return passkey.name?.trim() || 'Passkey';
}

export function PasskeyManager() {
  const [passkeys, setPasskeys] = useState<UserPasskey[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void fetchPasskeys();
  }, []);

  async function fetchPasskeys() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (error) {
        setError(error.message ?? 'Failed to load passkeys');
        return;
      }
      setPasskeys((data ?? []) as UserPasskey[]);
    } catch {
      setError('Failed to load passkeys');
    } finally {
      setLoading(false);
    }
  }

  async function addPasskey() {
    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      const { error } = await authClient.passkey.addPasskey({
        ...(newName.trim() ? { name: newName.trim() } : {}),
      });
      if (error) {
        setError(error.message ?? 'Could not register passkey');
        return;
      }
      setNewName('');
      setShowAddForm(false);
      setSuccess('Passkey linked to your account.');
      await fetchPasskeys();
    } catch {
      setError('Could not register passkey. Your browser may have cancelled the prompt.');
    } finally {
      setAdding(false);
    }
  }

  async function deletePasskey(id: string) {
    setError(null);
    setSuccess(null);
    try {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) {
        setError(error.message ?? 'Failed to remove passkey');
        return;
      }
      setSuccess('Passkey removed.');
      await fetchPasskeys();
    } catch {
      setError('Failed to remove passkey');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Passkeys</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Sign in with Face ID, Touch ID, Windows Hello, or a hardware security key.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAddForm(!showAddForm);
            setError(null);
            setSuccess(null);
          }}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {showAddForm ? 'Cancel' : 'Add Passkey'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
          {success}
        </div>
      )}

      {showAddForm && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-zinc-400">
                Label <span className="text-zinc-600">(optional)</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. MacBook Touch ID"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => void addPasskey()}
              disabled={adding}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {adding ? 'Waiting for authenticator...' : 'Register Passkey'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading passkeys...</p>
      ) : passkeys.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No passkeys linked yet. Add one to enable passwordless sign-in.
        </p>
      ) : (
        <div className="space-y-2">
          {passkeys.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{passkeyLabel(item)}</p>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-500">
                  <span className="capitalize">{item.deviceType.replace('-', ' ')}</span>
                  {item.backedUp && <span>Synced</span>}
                  {item.createdAt && (
                    <span>Added {new Date(item.createdAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void deletePasskey(item.id)}
                className="ml-4 rounded p-1 text-zinc-500 hover:text-red-400"
                title="Remove passkey"
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
          ))}
        </div>
      )}
    </div>
  );
}

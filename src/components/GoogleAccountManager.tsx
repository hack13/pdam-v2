import { useEffect, useState } from 'react';
import { authClient } from '../lib/auth-client';

type LinkedAccount = { providerId?: string; accountId?: string };

export function GoogleAccountManager() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadAccounts();
  }, []);

  async function loadAccounts() {
    const { data, error } = await authClient.listAccounts();
    if (error) {
      setError(error.message ?? 'Could not load connected accounts.');
      setLinked(false);
      return;
    }
    setLinked((data as LinkedAccount[] | null ?? []).some((account) => account.providerId === 'google'));
  }

  async function linkGoogle() {
    setError(null);
    setLinking(true);
    const { error } = await authClient.linkSocial({ provider: 'google', callbackURL: '/dashboard' });
    if (error) {
      setError(error.message ?? 'Could not start Google account linking.');
      setLinking(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Connected accounts</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Link Google to use it for sign-in. Google Drive access is granted separately when you add it as a sync destination.
          </p>
        </div>
        {linked === null ? (
          <span className="text-sm text-zinc-500">Loading…</span>
        ) : linked ? (
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-300">Google connected</span>
        ) : (
          <button type="button" onClick={() => void linkGoogle()} disabled={linking} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            {linking ? 'Redirecting to Google…' : 'Connect Google'}
          </button>
        )}
      </div>
      {error && <div role="alert" className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>}
    </div>
  );
}

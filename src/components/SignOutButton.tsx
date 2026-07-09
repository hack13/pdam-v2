import { useState } from 'react';
import { signOut } from '../lib/auth-client';

export function SignOutButton({ userName, compact = false }: { userName: string; compact?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    await signOut();
    window.location.href = '/';
  }

  if (compact) {
    return (
      <button
        onClick={handleSignOut}
        disabled={loading}
        className="text-sm text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
      >
        {loading ? 'Signing out...' : 'Logout'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-zinc-300">
        Signed in as <span className="font-medium text-white">{userName}</span>
      </span>
      <button
        onClick={handleSignOut}
        disabled={loading}
        className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
      >
        {loading ? 'Signing out...' : 'Sign Out'}
      </button>
    </div>
  );
}

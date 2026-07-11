import { useEffect, useState } from 'react';

type Token = { id: string; name: string; tokenPrefix: string };

export function PythonSyncManager() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tokenName, setTokenName] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [script, setScript] = useState('Loading Python script…');
  const [message, setMessage] = useState<string | null>(null);

  async function loadTokens() {
    const response = await fetch('/api/sync/tokens');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `Could not load sync tokens (${response.status})`);
    setTokens(data.tokens ?? []);
  }

  useEffect(() => {
    void loadTokens().catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load sync tokens.'));
    void fetch('/pdam-sync.py').then((response) => response.ok ? response.text() : Promise.reject(new Error('Could not load Python script.'))).then(setScript).catch(() => setScript('Could not load the script preview. Use the download button below.'));
  }, []);

  async function createToken(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/sync/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: tokenName }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(data.error ?? 'Could not create token.'); return; }
    setNewToken(data.token);
    setTokenName('');
    await loadTokens();
  }

  async function revoke(id: string) {
    await fetch(`/api/sync/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadTokens();
  }

  return <div className="space-y-6">
    {message && <div role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{message}</div>}
    <section className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={createToken} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4"><h2 className="font-medium text-white">Generate sync token</h2><p className="text-sm text-zinc-400">Create a read-only token for the Python client. Keep it private; it grants access to your sync files.</p><div className="flex gap-2"><input required value={tokenName} onChange={(event) => setTokenName(event.target.value)} placeholder="e.g. Home computer" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500" /><button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">Create</button></div>{newToken && <div className="rounded border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">Copy this token now; it will not be shown again.<code className="mt-2 block break-all">{newToken}</code></div>}</form>
      <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4"><h2 className="font-medium text-white">Manage tokens</h2>{tokens.length === 0 ? <p className="text-sm text-zinc-500">No sync tokens yet.</p> : tokens.map((token) => <div key={token.id} className="flex items-center justify-between gap-3 text-sm"><span className="text-zinc-300">{token.name} <code className="text-xs text-zinc-500">{token.tokenPrefix}…</code></span><button onClick={() => void revoke(token.id)} className="text-xs text-red-400">Revoke</button></div>)}</div>
    </section>
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5"><h2 className="font-medium text-white">How to use the Python client</h2><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-400"><li>Download <code>pdam-sync.py</code> below and save it somewhere easy to find.</li><li>Open Terminal, PowerShell, or Command Prompt in that folder.</li><li>Run the script with your PDAM URL, sync token, and optional local folder:</li></ol><code className="mt-3 block overflow-x-auto rounded-lg bg-black/30 px-3 py-2 text-sm text-indigo-200">python3 pdam-sync.py https://your-pdam-url.example pdam_sync_… ./pdam-backup</code><p className="mt-3 text-xs text-zinc-500">On Windows, use <code>python</code> instead of <code>python3</code> if needed. The script creates the folder, verifies file hashes, skips unchanged files, and never deletes local files.</p></section>
    <section className="rounded-xl border border-white/10 bg-white/5 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium text-white">Python sync script</h2><p className="mt-1 text-sm text-zinc-400">Save this script as <code>pdam-sync.py</code> and run it with your PDAM URL and sync token.</p></div><a href="/pdam-sync.py" download className="rounded-lg border border-white/10 px-3 py-2 text-sm text-indigo-300 hover:bg-white/5">Download Python script</a></div><pre className="mt-4 max-h-[36rem] overflow-auto rounded-lg border border-white/10 bg-black/30 p-4 text-xs leading-5 text-zinc-300"><code>{script}</code></pre></section>
  </div>;
}

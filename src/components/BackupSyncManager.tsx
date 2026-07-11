import { useEffect, useState } from 'react';

type Connection = { id: string; providerType: string; providerName: string; rootPath: string | null; enabled: boolean; lastSuccessfulSyncAt: string | null; lastError: string | null; scheduleEnabled: boolean; scheduleFrequency: string | null; scheduleDayOfWeek: number | null; scheduleTime: string | null; scheduleTimezone: string };
type Token = { id: string; name: string; tokenPrefix: string; expiresAt: string | null; revokedAt: string | null };

export function BackupSyncManager() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [providerType, setProviderType] = useState('s3');
  const [form, setForm] = useState<Record<string, string>>({ name: '', endpoint: '', bucket: '', region: 'auto', accessKeyId: '', secretAccessKey: '', username: '', password: '', rootPath: '', forcePathStyle: 'true' });
  const [tokenName, setTokenName] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [connectionsResponse, tokensResponse] = await Promise.all([fetch('/api/sync/connections'), fetch('/api/sync/tokens')]);
      const connectionsData = await connectionsResponse.json().catch(() => ({}));
      const tokensData = await tokensResponse.json().catch(() => ({}));
      if (!connectionsResponse.ok) throw new Error(connectionsData.error ?? `Could not load destinations (${connectionsResponse.status})`);
      if (!tokensResponse.ok) throw new Error(tokensData.error ?? `Could not load sync tokens (${tokensResponse.status})`);
      setConnections((connectionsData.connections ?? []).map((connection: Partial<Connection>) => ({
        ...connection,
        scheduleEnabled: connection.scheduleEnabled ?? false,
        scheduleFrequency: connection.scheduleFrequency ?? 'daily',
        scheduleDayOfWeek: connection.scheduleDayOfWeek ?? 0,
        scheduleTime: connection.scheduleTime ?? '03:00',
        scheduleTimezone: connection.scheduleTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
      })) as Connection[]);
      setTokens(tokensData.tokens ?? []);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load sync settings');
    }
  }
  useEffect(() => { void load(); }, []);
  function update(key: string, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function addConnection(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const response = await fetch('/api/sync/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerType, ...form, forcePathStyle: form.forcePathStyle !== 'false' }) });
    const data = await response.json(); setMessage(response.ok ? 'Destination connected.' : data.error ?? 'Could not connect destination.');
    if (response.ok) { setForm({ name: '', endpoint: '', bucket: '', region: 'auto', accessKeyId: '', secretAccessKey: '', username: '', password: '', rootPath: '', forcePathStyle: 'true' }); await load(); }
    setBusy(false);
  }
  async function sync(id: string) { setBusy(true); setMessage(null); const response = await fetch(`/api/sync/connections/${id}`, { method: 'POST' }); const data = await response.json().catch(() => ({ error: `Sync failed (${response.status})` })); setMessage(response.ok ? `Sync ${data.status === 'queued' ? 'queued' : data.status}. Open Activity for progress.` : data.error ?? 'Sync failed.'); await load(); setBusy(false); }
  async function remove(id: string) { await fetch(`/api/sync/connections/${id}`, { method: 'DELETE' }); await load(); }
  async function saveSchedule(connection: Connection) { const response = await fetch(`/api/sync/connections/${connection.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduleEnabled: connection.scheduleEnabled, scheduleFrequency: connection.scheduleFrequency, scheduleDayOfWeek: connection.scheduleDayOfWeek, scheduleTime: connection.scheduleTime, scheduleTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || connection.scheduleTimezone || 'UTC' }) }); setMessage(response.ok ? 'Backup schedule saved.' : 'Could not save backup schedule.'); await load(); }
  async function createToken(event: React.FormEvent) { event.preventDefault(); const response = await fetch('/api/sync/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: tokenName }) }); const data = await response.json(); if (response.ok) { setNewToken(data.token); setTokenName(''); await load(); } else setMessage(data.error ?? 'Could not create token.'); }
  async function revoke(id: string) { await fetch(`/api/sync/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); await load(); }

  return <div className="space-y-6">
    <div><h2 className="text-lg font-semibold text-white">Backups &amp; Sync</h2><p className="mt-1 text-sm text-zinc-400">Keep append-only copies in storage you control, or use the sync API from your own computer/server.</p></div>
    {loadError && <div role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{loadError}</div>}
    {message && <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200">{message}</div>}
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={addConnection} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="font-medium text-white">Add destination</h3>
        <select value={providerType} onChange={(event) => setProviderType(event.target.value)} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"><option value="s3">S3-compatible</option><option value="webdav">WebDAV / Nextcloud</option></select>
        {['name', 'endpoint'].map((key) => <input key={key} required value={form[key]} onChange={(event) => update(key, event.target.value)} placeholder={key === 'name' ? 'Destination name' : 'https://storage.example.com'} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500" />)}
        {providerType === 's3' ? <><input required value={form.bucket} onChange={(event) => update('bucket', event.target.value)} placeholder="Bucket" className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500" /><div className="grid grid-cols-2 gap-3"><input required value={form.region} onChange={(event) => update('region', event.target.value)} placeholder="Region (auto, us-east-1)" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500" /><label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400"><input type="checkbox" checked={form.forcePathStyle !== 'false'} onChange={(event) => update('forcePathStyle', String(event.target.checked))} /> Path-style requests</label></div><div className="grid grid-cols-2 gap-3"><input required value={form.accessKeyId} onChange={(event) => update('accessKeyId', event.target.value)} placeholder="Access key" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500" /><input required type="password" value={form.secretAccessKey} onChange={(event) => update('secretAccessKey', event.target.value)} placeholder="Secret key" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500" /></div><p className="text-[11px] text-zinc-500">Use the provider's service endpoint, not a URL containing the bucket name. Cloudflare R2 commonly uses region <code>auto</code>; AWS usually requires the bucket's actual region.</p></> : <div className="grid grid-cols-2 gap-3"><input required value={form.username} onChange={(event) => update('username', event.target.value)} placeholder="Username" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500" /><input required type="password" value={form.password} onChange={(event) => update('password', event.target.value)} placeholder="Password" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500" /></div>}
        <input value={form.rootPath} onChange={(event) => update('rootPath', event.target.value)} placeholder="Remote folder (optional)" className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500" />
        <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Test &amp; save</button>
      </form>
      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4"><h3 className="font-medium text-white">Connected destinations</h3>{connections.length === 0 ? <p className="text-sm text-zinc-500">No destinations yet.</p> : connections.map((connection) => <div key={connection.id} className="rounded-lg border border-white/10 px-3 py-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm text-white">{connection.providerName}</p><p className="text-xs text-zinc-500">{connection.providerType} · {connection.lastError ?? (connection.lastSuccessfulSyncAt ? `Last sync ${new Date(connection.lastSuccessfulSyncAt).toLocaleString()}` : 'Never synced')}</p></div><div className="flex gap-2"><button onClick={() => sync(connection.id)} className="rounded bg-indigo-600 px-2 py-1 text-xs text-white">Sync now</button><button onClick={() => remove(connection.id)} className="rounded px-2 py-1 text-xs text-red-400">Remove</button></div></div><div className="mt-3 border-t border-white/5 pt-3"><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={connection.scheduleEnabled} onChange={(event) => setConnections((items) => items.map((item) => item.id === connection.id ? { ...item, scheduleEnabled: event.target.checked } : item))} /> Automatic backup</label><select value={connection.scheduleFrequency ?? 'daily'} onChange={(event) => setConnections((items) => items.map((item) => item.id === connection.id ? { ...item, scheduleFrequency: event.target.value } : item))} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs text-white"><option value="daily">Daily</option><option value="weekly">Weekly</option></select><input type="time" value={connection.scheduleTime ?? '03:00'} onChange={(event) => setConnections((items) => items.map((item) => item.id === connection.id ? { ...item, scheduleTime: event.target.value } : item))} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs text-white" />{connection.scheduleFrequency === 'weekly' && <select value={String(connection.scheduleDayOfWeek ?? 0)} onChange={(event) => setConnections((items) => items.map((item) => item.id === connection.id ? { ...item, scheduleDayOfWeek: Number(event.target.value) } : item))} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs text-white"><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select>}<button onClick={() => saveSchedule(connection)} className="rounded border border-white/10 px-2 py-1 text-xs text-indigo-300 hover:bg-white/5">Save schedule</button></div><p className="mt-2 text-[11px] text-zinc-500">Time zone: {connection.scheduleTimezone}</p></div></div>)}</div>
    </div>
    <div className="grid gap-6 lg:grid-cols-2"><form onSubmit={createToken} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4"><h3 className="font-medium text-white">Local/server sync token</h3><p className="text-sm text-zinc-400">Create a read-only token for the browser client or your own backup server.</p><div className="flex gap-2"><input required value={tokenName} onChange={(event) => setTokenName(event.target.value)} placeholder="e.g. Home server" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-zinc-500" /><button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">Create</button></div>{newToken && <div className="rounded border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">Copy this now; it will not be shown again.<code className="mt-2 block break-all">{newToken}</code></div>}</form><div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4"><h3 className="font-medium text-white">Active tokens</h3>{tokens.map((token) => <div key={token.id} className="flex items-center justify-between text-sm"><span className="text-zinc-300">{token.name} <code className="text-xs text-zinc-500">{token.tokenPrefix}…</code></span><button onClick={() => revoke(token.id)} className="text-xs text-red-400">Revoke</button></div>)}</div></div>
    <div className="rounded-xl border border-white/10 bg-white/5 p-4"><h3 className="font-medium text-white">Local client</h3><p className="mt-1 text-sm text-zinc-400">Download the standalone Node script and run it with your PDAM URL and sync token. It verifies hashes and never deletes local files.</p><a href="/pdam-sync.mjs" download className="mt-3 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-indigo-300">Download sync script</a></div>
  </div>;
}

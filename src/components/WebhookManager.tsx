import { useEffect, useState } from 'react';

interface Marketplace {
  id: string;
  name: string;
}

interface Webhook {
  id: string;
  marketplaceSourceId: string | null;
  endpointUrl: string;
  secret?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function WebhookManager() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [marketplaceSourceId, setMarketplaceSourceId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [hooksRes, marketsRes] = await Promise.all([
        fetch('/api/creator/webhooks'),
        fetch('/api/marketplace-sources'),
      ]);
      if (!hooksRes.ok) throw new Error('Failed to load webhooks');
      if (!marketsRes.ok) throw new Error('Failed to load marketplaces');
      const hooksData = await hooksRes.json();
      const marketsData = await marketsRes.json();
      setWebhooks(hooksData.webhooks ?? []);
      setMarketplaces(
        Array.isArray(marketsData) ? marketsData : marketsData.sources ?? marketsData.marketplaces ?? [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/creator/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointUrl,
          marketplaceSourceId: marketplaceSourceId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create webhook');
      setShowForm(false);
      setEndpointUrl('');
      setMarketplaceSourceId('');
      if (data.secret) setRevealedSecrets((current) => ({ ...current, [data.id]: data.secret }));
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  }

  async function rotateSecret(id: string) {
    if (!confirm('Rotate this webhook secret? Your endpoint must be updated.')) return;
    const res = await fetch(`/api/creator/webhooks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotateSecret: true }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to rotate secret');
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.secret) setRevealedSecrets((current) => ({ ...current, [id]: data.secret }));
    await loadData();
  }

  async function toggleActive(hook: Webhook) {
    const res = await fetch(`/api/creator/webhooks/${hook.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !hook.isActive }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to update');
      return;
    }
    await loadData();
  }

  async function removeWebhook(id: string) {
    if (!confirm('Delete this verification webhook?')) return;
    const res = await fetch(`/api/creator/webhooks/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to delete');
      return;
    }
    await loadData();
  }

  function marketplaceName(id: string | null) {
    if (!id) return 'All marketplaces (default)';
    return marketplaces.find((m) => m.id === id)?.name ?? 'Unknown';
  }

  if (loading) return <p className="text-sm text-zinc-400">Loading verification endpoints…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">License verification webhooks</h2>
          <p className="mt-1 text-sm text-zinc-400">
            PDAM will POST license checks to your endpoint so verification stays under your control
            (Gumroad, Jinxxy, or custom tooling).
          </p>
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="btn-primary">
          Add endpoint
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
        <p className="font-medium text-zinc-300">Request format</p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-zinc-300">{`POST {endpoint}
Headers:
  Content-Type: application/json
  X-PDAM-Timestamp: <unix seconds>
  X-PDAM-Signature: HMAC-SHA256(secret, "{timestamp}.{body}")

Body:
{
  "event": "license.verify",
  "productId": "...",
  "productTitle": "...",
  "marketplaceSourceId": "...",
  "marketplaceSlug": "gumroad",
  "licenseKey": "...",
  "userId": "...",
  "userEmail": "..."
}

Respond with:
{ "verified": true } or { "verified": false, "reason": "..." }`}</pre>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {webhooks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
          <p className="text-sm text-zinc-400">No verification endpoints configured.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((hook) => (
            <div
              key={hook.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{hook.endpointUrl}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {marketplaceName(hook.marketplaceSourceId)} ·{' '}
                    {hook.isActive ? (
                      <span className="text-emerald-400">Active</span>
                    ) : (
                      <span className="text-zinc-500">Inactive</span>
                    )}
                  </p>
                  <p className="mt-2 font-mono text-xs text-zinc-500">
                    Secret:{' '}{revealedSecrets[hook.id] ?? 'Stored securely'}
                    {revealedSecrets[hook.id] && (
                      <button
                        type="button"
                        onClick={() => setRevealedSecrets((current) => {
                          const next = { ...current };
                          delete next[hook.id];
                          return next;
                        })}
                        className="ml-2 text-indigo-400 hover:text-indigo-300"
                      >
                        Hide
                      </button>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(hook)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300"
                  >
                    {hook.isActive ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateSecret(hook.id)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300"
                  >
                    Rotate secret
                  </button>
                  <button
                    type="button"
                    onClick={() => removeWebhook(hook.id)}
                    className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 p-6">
            <h3 className="text-lg font-semibold text-white">Add verification endpoint</h3>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm text-zinc-400">Endpoint URL</label>
                <input
                  type="url"
                  required
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://your-tool.example/verify"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-zinc-400">Marketplace scope</label>
                <select
                  value={marketplaceSourceId}
                  onChange={(e) => setMarketplaceSourceId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                >
                  <option value="">All marketplaces (default)</option>
                  {marketplaces.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} only
                    </option>
                  ))}
                </select>
              </div>
              {formError && <p className="text-sm text-red-400">{formError}</p>}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

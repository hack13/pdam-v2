import { useEffect, useState } from 'react';

interface Marketplace {
  id: string;
  name: string;
  slug: string;
}

interface PurchaseLinkDraft {
  marketplaceSourceId: string;
  productUrl: string;
  marketplaceProductId: string;
  label: string;
}

interface Listing {
  id: string;
  title: string;
  slug: string;
  ownershipConfirmations: number;
  marketplaceClicks: number;
  purchaseLinks: Array<{
    id: string;
    marketplaceSourceId: string;
    productUrl: string;
    marketplaceProductId: string | null;
    label: string | null;
  }>;
}

interface AssetOption {
  id: string;
  title: string;
  isGalleryListed?: boolean;
  sourceProductId?: string | null;
}

interface LinkedCreatorInfo {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  initialListings?: Listing[];
  initialLinkedCreator?: LinkedCreatorInfo | null;
}

export function ListingManager({
  initialListings = [],
  initialLinkedCreator = null,
}: Props) {
  const [listings, setListings] = useState<Listing[]>(initialListings);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [linkedCreator, setLinkedCreator] = useState<LinkedCreatorInfo | null>(
    initialLinkedCreator,
  );
  const [loading, setLoading] = useState(initialListings.length === 0);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productId, setProductId] = useState('');
  const [links, setLinks] = useState<PurchaseLinkDraft[]>([
    { marketplaceSourceId: '', productUrl: '', marketplaceProductId: '', label: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [listingsRes, assetsRes, marketsRes, profileRes] = await Promise.all([
        fetch('/api/creator/listings'),
        fetch('/api/creator/listable-assets'),
        fetch('/api/marketplace-sources'),
        fetch('/api/creator/profile'),
      ]);
      if (!listingsRes.ok) throw new Error('Failed to load listings');
      if (!marketsRes.ok) throw new Error('Failed to load marketplaces');

      const listingsData = await listingsRes.json();
      const marketsData = await marketsRes.json();
      const profileData = profileRes.ok ? await profileRes.json() : { linkedCreator: null };

      setListings(listingsData.listings ?? []);
      setLinkedCreator(profileData.linkedCreator ?? null);
      setMarketplaces(
        Array.isArray(marketsData) ? marketsData : marketsData.sources ?? marketsData.marketplaces ?? [],
      );

      if (assetsRes.ok) {
        const assetsData = await assetsRes.json();
        setAssets(assetsData.assets ?? []);
        if (assetsData.linkedCreator) {
          setLinkedCreator(assetsData.linkedCreator);
        }
      } else {
        setAssets([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setProductId('');
    setLinks([{ marketplaceSourceId: marketplaces[0]?.id ?? '', productUrl: '', marketplaceProductId: '', label: '' }]);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(listing: Listing) {
    setEditingId(listing.id);
    setProductId(listing.id);
    setLinks(
      listing.purchaseLinks.length > 0
        ? listing.purchaseLinks.map((l) => ({
            marketplaceSourceId: l.marketplaceSourceId,
            productUrl: l.productUrl,
            marketplaceProductId: l.marketplaceProductId ?? '',
            label: l.label ?? '',
          }))
        : [{ marketplaceSourceId: marketplaces[0]?.id ?? '', productUrl: '', marketplaceProductId: '', label: '' }],
    );
    setFormError('');
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      const payload = {
        productId,
        purchaseLinks: links.map((l) => ({
          marketplaceSourceId: l.marketplaceSourceId,
          productUrl: l.productUrl.trim(),
          marketplaceProductId: l.marketplaceProductId.trim(),
          label: l.label.trim() || undefined,
        })),
      };

      const res = await fetch(
        editingId ? `/api/creator/listings/${editingId}` : '/api/creator/listings',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingId ? { purchaseLinks: payload.purchaseLinks } : payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save listing');

      setShowForm(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlist(id: string, title: string) {
    if (!confirm(`Remove "${title}" from the gallery?`)) return;
    const res = await fetch(`/api/creator/listings/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to unlist');
      return;
    }
    await loadData();
  }

  const availableAssets = assets.filter(
    (a) => !listings.some((l) => l.id === a.id) || a.id === editingId,
  );

  if (loading) {
    return <p className="text-sm text-zinc-400">Loading listings…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Gallery listings</h2>
          <p className="text-sm text-zinc-400">
            {linkedCreator
              ? `Only library assets tagged with ${linkedCreator.name} can be published.`
              : 'Link a creator profile before publishing assets to the gallery.'}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={!linkedCreator}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          List asset
        </button>
      </div>

      {!linkedCreator && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-zinc-300">
          You need to{' '}
          <a href="/creator/profile" className="text-indigo-400 hover:text-indigo-300">
            link a creator profile
          </a>{' '}
          first. Then tag assets in your library with that creator to list them here.
        </div>
      )}

      {linkedCreator && assets.length === 0 && listings.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
          No eligible assets yet. In your library, edit an asset and tag it with{' '}
          <span className="font-medium text-zinc-200">{linkedCreator.name}</span>, then return here
          to list it.
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {listings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
          <p className="text-sm text-zinc-400">No gallery listings yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Asset</th>
                <th className="px-4 py-3 font-medium">Owners</th>
                <th className="px-4 py-3 font-medium">Clicks</th>
                <th className="px-4 py-3 font-medium">Links</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <a href={`/gallery/${listing.id}`} className="font-medium text-white hover:text-indigo-300">
                      {listing.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{listing.ownershipConfirmations}</td>
                  <td className="px-4 py-3 text-zinc-300">{listing.marketplaceClicks}</td>
                  <td className="px-4 py-3 text-zinc-400">{listing.purchaseLinks.length}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(listing)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUnlist(listing.id, listing.title)}
                        className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-400"
                      >
                        Unlist
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white">
              {editingId ? 'Edit listing' : 'List asset in gallery'}
            </h3>
            <form onSubmit={handleSave} className="mt-4 space-y-4">
              {!editingId && (
                <div>
                  <label className="mb-1 block text-sm text-zinc-400">Asset</label>
                  <select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    required
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                  >
                    <option value="">Select an asset…</option>
                    {availableAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-zinc-400">Purchase links</label>
                  <button
                    type="button"
                    onClick={() =>
                      setLinks((prev) => [
                        ...prev,
                        { marketplaceSourceId: marketplaces[0]?.id ?? '', productUrl: '', marketplaceProductId: '', label: '' },
                      ])
                    }
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Add marketplace
                  </button>
                </div>
                {links.map((link, index) => (
                  <div key={index} className="space-y-2 rounded-lg border border-white/10 p-3">
                    <select
                      value={link.marketplaceSourceId}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLinks((prev) =>
                          prev.map((l, i) =>
                            i === index ? { ...l, marketplaceSourceId: value } : l,
                          ),
                        );
                      }}
                      required
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                    >
                      <option value="">Marketplace…</option>
                      {marketplaces.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="url"
                      placeholder="https://…"
                      value={link.productUrl}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLinks((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, productUrl: value } : l)),
                        );
                      }}
                      required
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                    />
                    <input
                      type="text"
                      placeholder="Marketplace product ID (used for verification)"
                      value={link.marketplaceProductId}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLinks((prev) =>
                          prev.map((l, i) =>
                            i === index ? { ...l, marketplaceProductId: value } : l,
                          ),
                        );
                      }}
                      required
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                    />
                    <input
                      type="text"
                      placeholder="Optional label"
                      value={link.label}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLinks((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, label: value } : l)),
                        );
                      }}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                    />
                    {links.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
                        className="text-xs text-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {formError && <p className="text-sm text-red-400">{formError}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

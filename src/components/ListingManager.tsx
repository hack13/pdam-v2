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
  galleryMedia: GalleryMedia[];
}

interface GalleryMedia {
  id: string;
  mediaType: 'image' | 'video';
  url: string;
  altText: string | null;
  caption: string | null;
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
  const [media, setMedia] = useState<GalleryMedia[]>([]);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('video');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);

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
    setMedia([]);
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
    setMedia(listing.galleryMedia ?? []);
    setShowForm(true);
  }

  async function addRemoteMedia() {
    if (!editingId || !mediaUrl.trim()) return;
    setMediaBusy(true);
    setFormError('');
    try {
      const response = await fetch(`/api/creator/listings/${editingId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaType,
          url: mediaUrl.trim(),
          caption: mediaCaption.trim() || undefined,
          altText: mediaType === 'image' ? mediaCaption.trim() || undefined : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not add media');
      setMedia((current) => [...current, data.media]);
      setMediaUrl('');
      setMediaCaption('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add media');
    } finally {
      setMediaBusy(false);
    }
  }

  async function uploadGalleryImage(file: File | null) {
    if (!editingId || !file) return;
    setMediaBusy(true);
    setFormError('');
    const form = new FormData();
    form.append('image', file);
    form.append('altText', mediaCaption.trim());
    form.append('caption', mediaCaption.trim());
    try {
      const response = await fetch(`/api/creator/listings/${editingId}/media`, {
        method: 'POST',
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not upload image');
      setMedia((current) => [...current, data.media]);
      setMediaCaption('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not upload image');
    } finally {
      setMediaBusy(false);
    }
  }

  async function removeMedia(mediaId: string) {
    if (!editingId) return;
    setMediaBusy(true);
    setFormError('');
    try {
      const response = await fetch(
        `/api/creator/listings/${editingId}/media?${new URLSearchParams({ mediaId })}`,
        { method: 'DELETE' },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not remove media');
      setMedia((current) => current.filter((item) => item.id !== mediaId));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not remove media');
    } finally {
      setMediaBusy(false);
    }
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
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-kicker !text-zinc-500">Public catalog</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Gallery listings</h2>
          <p className="mt-1 text-sm text-zinc-400">
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
        <div className="grid gap-3">
          {listings.map((listing) => (
            <article key={listing.id} className="app-panel-raised p-4 sm:p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 lg:max-w-md">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)]" aria-hidden="true" />
                    <span className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-cyan-300">Published</span>
                  </div>
                  <a href={`/gallery/${listing.id}`} className="mt-2 block truncate font-display text-lg font-semibold text-white hover:text-indigo-300">
                    {listing.title}
                  </a>
                  <a href={`/gallery/${listing.id}`} className="mt-1 inline-block text-xs text-zinc-500 hover:text-white">View public listing &rarr;</a>
                </div>

                <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-white/[0.08] bg-black/15 lg:w-[23rem]">
                  <div className="px-3 py-3 text-center"><p className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-zinc-600">Owners</p><p className="mt-1 font-display text-lg font-semibold text-white">{listing.ownershipConfirmations}</p></div>
                  <div className="border-x border-white/[0.08] px-3 py-3 text-center"><p className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-zinc-600">Visits</p><p className="mt-1 font-display text-lg font-semibold text-white">{listing.marketplaceClicks}</p></div>
                  <div className="px-3 py-3 text-center"><p className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-zinc-600">Links</p><p className="mt-1 font-display text-lg font-semibold text-white">{listing.purchaseLinks.length}</p></div>
                </div>

                <div className="flex gap-2 lg:justify-end">
                  <button type="button" onClick={() => openEdit(listing)} className="btn-secondary !px-4 !py-2">Edit listing</button>
                  <button type="button" onClick={() => handleUnlist(listing.id, listing.title)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15">Unlist</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="app-panel-raised max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5 shadow-2xl sm:p-6">
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
                    className="field-control"
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
                      className="field-control"
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
                      className="field-control font-mono"
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

              <div className="space-y-3 border-t border-white/10 pt-4">
                <div>
                  <label className="text-sm font-medium text-zinc-300">Storefront gallery</label>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Add up to 12 large images or videos. These appear only on the public gallery listing and are never copied into a buyer&apos;s library.
                  </p>
                </div>

                {!editingId ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/15 p-4 text-xs text-zinc-500">
                    Save the listing first, then choose Edit listing to add storefront media.
                  </div>
                ) : (
                  <>
                    {media.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {media.map((item) => (
                          <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
                            <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
                              {item.mediaType === 'image' ? (
                                <img src={item.url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <svg className="h-5 w-5 text-indigo-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-zinc-300">{item.caption || (item.mediaType === 'image' ? 'Gallery image' : 'Gallery video')}</p>
                              <p className="truncate font-mono text-[0.6rem] text-zinc-600">{item.mediaType}</p>
                            </div>
                            <button type="button" onClick={() => void removeMedia(item.id)} disabled={mediaBusy} className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-white/5 hover:text-red-300 disabled:opacity-40" aria-label="Remove media">Remove</button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                      <input
                        type="text"
                        value={mediaCaption}
                        onChange={(e) => setMediaCaption(e.target.value)}
                        placeholder="Optional caption or image description"
                        className="field-control !py-2.5"
                      />
                      <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
                        <select value={mediaType} onChange={(e) => setMediaType(e.target.value as 'image' | 'video')} className="field-control !py-2.5">
                          <option value="video">Video URL</option>
                          <option value="image">Image URL</option>
                        </select>
                        <input type="url" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder={mediaType === 'video' ? 'YouTube, Vimeo, or direct video URL' : 'https://…/image.jpg'} className="field-control !py-2.5" />
                        <button type="button" onClick={() => void addRemoteMedia()} disabled={mediaBusy || !mediaUrl.trim() || media.length >= 12} className="btn-secondary !px-4 !py-2.5 disabled:opacity-40">Add URL</button>
                      </div>
                      <div className="my-3 flex items-center gap-3 text-[0.65rem] uppercase tracking-[0.14em] text-zinc-600"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>
                      <label className="btn-secondary w-full cursor-pointer !py-2.5 text-center disabled:opacity-40">
                        {mediaBusy ? 'Working…' : 'Upload a large image'}
                        <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif,image/tiff" disabled={mediaBusy || media.length >= 12} className="hidden" onChange={(e) => { void uploadGalleryImage(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                      </label>
                    </div>
                  </>
                )}
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

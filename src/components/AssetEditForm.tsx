import { useState, useEffect } from 'react';
import { ThumbnailPicker } from './ThumbnailPicker';
import { MultiCreatorAutocomplete } from './MultiCreatorAutocomplete';

interface MarketplaceSource {
  id: string;
  name: string;
  slug: string;
  baseUrl: string | null;
}

interface CreatorEntry {
  id: string;
  name: string;
  slug: string;
}

interface AssetEditFormProps {
  productId: string;
  initialTitle: string;
  initialDescription: string;
  initialTags: string[];
  initialCreators?: CreatorEntry[];
  initialLicenseKey: string;
  initialMarketplaceSourceId?: string;
  initialProductUrl?: string;
  thumbnailUrl?: string;
  onClose: () => void;
}

export function AssetEditForm({
  productId,
  initialTitle,
  initialDescription,
  initialTags,
  initialCreators,
  initialLicenseKey,
  initialMarketplaceSourceId,
  initialProductUrl,
  thumbnailUrl,
  onClose,
}: AssetEditFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription || '');
  const [tags, setTags] = useState<string[]>(initialTags);
  const [selectedCreators, setSelectedCreators] = useState<CreatorEntry[]>(initialCreators ?? []);
  const [licenseKey, setLicenseKey] = useState(initialLicenseKey || '');
  const [marketplaceSourceId, setMarketplaceSourceId] = useState(initialMarketplaceSourceId || '');
  const [productUrl, setProductUrl] = useState(initialProductUrl || '');
  const [marketplaceSources, setMarketplaceSources] = useState<MarketplaceSource[]>([]);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(thumbnailUrl || null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/marketplace-sources')
      .then((res) => res.json())
      .then((data) => setMarketplaceSources(data as MarketplaceSource[]))
      .catch(() => {});
  }, []);

  function handleMarketplaceChange(sourceId: string) {
    setMarketplaceSourceId(sourceId);
    if (sourceId !== initialMarketplaceSourceId) {
      setProductUrl('');
    }
  }

  function handleCreatorsChange(newCreators: CreatorEntry[]) {
    setSelectedCreators(newCreators);
  }

  function handleFileChange(file: File | null) {
    setThumbnailFile(file);
    if (thumbnailPreview && !thumbnailUrl) URL.revokeObjectURL(thumbnailPreview);
    setThumbnailPreview(file ? URL.createObjectURL(file) : thumbnailUrl || null);
  }

  function addTag(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags([...tags, trimmed]);
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleTagKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if ((event.key === 'Enter' || event.key === ',') && event.currentTarget.value.trim()) {
      event.preventDefault();
      addTag(event.currentTarget.value);
      event.currentTarget.value = '';
    }
    if (event.key === 'Backspace' && !event.currentTarget.value && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});

    if (!title.trim()) {
      setErrors({ title: 'Title is required' });
      return;
    }

    setSaving(true);

    try {
      // Update metadata
      const metadataRes = await fetch(`/api/assets/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          tags: tags.join(','),
          creators: selectedCreators.map((c) => ({
            id: c.id.startsWith('new:') ? undefined : c.id,
            name: c.name,
          })),
          licenseKey: licenseKey.trim() || undefined,
          marketplaceSourceId: marketplaceSourceId || undefined,
          productUrl: productUrl.trim() || undefined,
        }),
      });

      if (!metadataRes.ok) {
        const data = await metadataRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to update asset');
      }

      // Upload new thumbnail if provided
      if (thumbnailFile) {
        const form = new FormData();
        form.append('thumbnail', thumbnailFile);
        
        const thumbnailRes = await fetch(`/api/assets/${productId}/thumbnail`, {
          method: 'POST',
          body: form,
        });

        if (!thumbnailRes.ok) {
          const data = await thumbnailRes.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? 'Failed to upload thumbnail');
        }
      }

      // Reload the page to show updated data
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update asset');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-zinc-900 border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Edit Asset</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white"
            disabled={saving}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="My VR Asset Pack"
              disabled={saving}
            />
            {errors.title && <p className="mt-1 text-sm text-red-400">{errors.title}</p>}
          </div>

          {/* Creators */}
          <div>
            <label htmlFor="creators" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Creators <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <MultiCreatorAutocomplete
              creators={selectedCreators}
              onChange={handleCreatorsChange}
              initialCreators={initialCreators}
              disabled={saving}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Describe your asset..."
              disabled={saving}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Markdown supported: **bold**, *italic*, lists, links, and more.
            </p>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Tags
            </label>
            <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-zinc-800 border border-white/10">
              {tags.map((tag) => (
                <span key={tag} className="px-2 py-1 text-sm bg-indigo-500/20 text-indigo-300 rounded flex items-center gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-indigo-400 hover:text-indigo-200"
                    disabled={saving}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder={tags.length === 0 ? "Add tags..." : ""}
                onKeyDown={handleTagKeyDown}
                onBlur={(e) => {
                  if (e.target.value.trim()) {
                    addTag(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="flex-1 min-w-[120px] bg-transparent text-white placeholder-zinc-500 focus:outline-none"
                disabled={saving}
              />
            </div>
          </div>

          {/* License Key */}
          <div>
            <label htmlFor="licenseKey" className="block text-sm font-medium text-zinc-300 mb-1.5">
              License Key <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <input
              id="licenseKey"
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              className="w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              autoComplete="off"
              disabled={saving}
            />
          </div>

          {/* Thumbnail */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Thumbnail
            </label>
            <ThumbnailPicker preview={thumbnailPreview} onFileChange={handleFileChange} />
          </div>

          {/* Marketplace Source */}
          <div>
            <label htmlFor="edit-marketplaceSource" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Marketplace <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <select
              id="edit-marketplaceSource"
              value={marketplaceSourceId}
              onChange={(e) => handleMarketplaceChange(e.target.value)}
              className="w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={saving}
            >
              <option value="">Select marketplace...</option>
              {marketplaceSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </div>

          {marketplaceSourceId && (
            <div>
              <label htmlFor="edit-productUrl" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Store Page URL <span className="text-zinc-500 font-normal">(optional)</span>
              </label>
              <input
                id="edit-productUrl"
                type="url"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                className="w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="https://example.com/product/123"
                disabled={saving}
              />
              <p className="mt-1 text-xs text-zinc-500">
                Link to the product page on the marketplace
              </p>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

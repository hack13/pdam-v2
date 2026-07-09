import { useState, useEffect, type FormEvent, type KeyboardEvent } from 'react';
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

export function AssetCreateForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedCreators, setSelectedCreators] = useState<CreatorEntry[]>([]);
  const [licenseKey, setLicenseKey] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [marketplaceSourceId, setMarketplaceSourceId] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [marketplaceSources, setMarketplaceSources] = useState<MarketplaceSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleMarketplaceChange(sourceId: string) {
    setMarketplaceSourceId(sourceId);
    setProductUrl('');
  }

  function handleCreatorsChange(newCreators: CreatorEntry[]) {
    setSelectedCreators(newCreators);
  }

  useEffect(() => {
    fetch('/api/marketplace-sources')
      .then((res) => res.json())
      .then((data) => setMarketplaceSources(data as MarketplaceSource[]))
      .catch(() => {});
  }, []);

  function handleFileChange(file: File | null) {
    setThumbnailFile(file);
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    setThumbnailPreview(file ? URL.createObjectURL(file) : null);
  }

  function addTag(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags([...tags, trimmed]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault();
      const parts = tagInput.split(',');
      for (const part of parts) addTag(part);
    }
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setSubmitting(true);

    try {
      const createRes = await fetch('/api/assets', {
        method: 'POST',
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

      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to create asset');
      }

      const product = (await createRes.json()) as { id: string };

      if (thumbnailFile) {
        const form = new FormData();
        form.append('thumbnail', thumbnailFile);
        const thumbRes = await fetch(`/api/assets/${product.id}/thumbnail`, {
          method: 'POST',
          body: form,
        });
        if (!thumbRes.ok) {
          const data = await thumbRes.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? 'Failed to upload thumbnail');
        }
      }

      window.location.href = `/assets/${product.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Title
        </label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-white/10"
          placeholder="My VR Asset Pack"
          maxLength={200}
        />
      </div>

      <div>
        <label htmlFor="creators" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Creators <span className="text-zinc-600">(optional)</span>
        </label>
        <MultiCreatorAutocomplete
          creators={selectedCreators}
          onChange={handleCreatorsChange}
          disabled={submitting}
        />
      </div>

      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Description <span className="text-zinc-600">(optional)</span>
        </label>
        <textarea
          id="description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-white/10"
          placeholder="Describe your asset..."
          maxLength={10000}
        />
      </div>

      <div>
        <label htmlFor="tagInput" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Tags <span className="text-zinc-600">(press Enter or comma to add)</span>
        </label>
        <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition-colors focus-within:border-indigo-500 focus-within:bg-white/10">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-300"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-0.5 text-indigo-400 hover:text-white"
                aria-label={`Remove ${tag}`}
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          <input
            id="tagInput"
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={() => tagInput.trim() && addTag(tagInput)}
            className="min-w-[100px] flex-1 bg-transparent py-0.5 text-sm text-white placeholder-zinc-500 outline-none"
            placeholder={tags.length === 0 ? 'vrchat, avatar, unity...' : ''}
          />
        </div>
      </div>

      <div>
        <label htmlFor="licenseKey" className="mb-1.5 block text-sm font-medium text-zinc-300">
          License Key <span className="text-zinc-600">(optional)</span>
        </label>
        <input
          id="licenseKey"
          type="text"
          value={licenseKey}
          onChange={(e) => setLicenseKey(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-white/10"
          placeholder="Enter license key if applicable"
          maxLength={200}
          data-mask="license-key"
        />
        <p className="mt-1 text-xs text-zinc-600">
          Protected field - only visible to you
        </p>
      </div>

      <ThumbnailPicker preview={thumbnailPreview} onFileChange={handleFileChange} />

      <div>
        <label htmlFor="marketplaceSource" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Marketplace <span className="text-zinc-600">(optional)</span>
        </label>
        <select
          id="marketplaceSource"
          value={marketplaceSourceId}
          onChange={(e) => handleMarketplaceChange(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-white/10"
          disabled={submitting}
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
          <label htmlFor="productUrl" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Store Page URL <span className="text-zinc-600">(optional)</span>
          </label>
          <input
            id="productUrl"
            type="url"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:bg-white/10"
            placeholder="https://example.com/product/123"
            maxLength={500}
            disabled={submitting}
          />
          <p className="mt-1 text-xs text-zinc-600">
            Link to the product page on the marketplace
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <a href="/library" className="rounded-lg px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:text-white">
          Cancel
        </a>
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Asset'}
        </button>
      </div>
    </form>
  );
}

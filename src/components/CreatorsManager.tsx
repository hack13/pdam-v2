import { useEffect, useMemo, useState } from 'react';

interface CatalogCreator {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  bio: string | null;
  profileImageUrl: string | null;
  isVerified: boolean;
  isVerifiedByMe: boolean;
  updatedAt: string;
}

export function CreatorsManager() {
  const [creators, setCreators] = useState<CatalogCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchCreators();
  }, []);

  async function fetchCreators(q?: string) {
    try {
      const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const res = await fetch(`/api/creators${qs}`);
      if (!res.ok) throw new Error('Failed to load creators');
      const data = await res.json();
      setCreators(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load creators');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    await fetchCreators(search);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/creators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create creator');
      }

      setName('');
      setShowForm(false);
      setLoading(true);
      await fetchCreators(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create creator');
    } finally {
      setSubmitting(false);
    }
  }

  const verifiedCreators = useMemo(
    () => creators.filter((c) => c.isVerified),
    [creators],
  );
  const catalogCreators = useMemo(
    () => creators.filter((c) => !c.isVerified),
    [creators],
  );

  if (loading && creators.length === 0) {
    return <div className="text-zinc-400">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-zinc-500">
            Creator directory
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">Known creators</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Verified identities are enrolled in TailCache. Catalog entries are names already in the
            system for tagging assets.
          </p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-secondary !px-4 !py-2">
            Add to catalog
          </button>
        )}
      </div>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
            />
          </svg>
          <label htmlFor="library-creator-search" className="sr-only">
            Search creators
          </label>
          <input
            id="library-creator-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search creators…"
            className="field-control !pl-11"
          />
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="app-panel mb-6 p-5">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Studio Name"
                required
                maxLength={100}
                className="field-control"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary !px-4 !py-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Adding...' : 'Add Creator'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setName('');
                  setError('');
                }}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {creators.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-12 text-center">
          <h4 className="font-display text-lg font-semibold text-white">
            {search ? 'No creators found' : 'No creators in the catalog yet'}
          </h4>
          <p className="mt-1 text-sm text-zinc-400">
            {search
              ? 'Try a different name.'
              : 'Add a creator to the catalog, or they will appear when tagged on an asset.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h4 className="mb-3 font-mono text-[0.68rem] font-medium uppercase tracking-[0.18em] text-zinc-500">
              Verified creators
            </h4>
            {verifiedCreators.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No verified creators match{search ? ' this search' : ' yet'}.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {verifiedCreators.map((creator) => (
                  <CreatorRow key={creator.id} creator={creator} />
                ))}
              </div>
            )}
          </section>

          {catalogCreators.length > 0 && (
            <section>
              <h4 className="mb-3 font-mono text-[0.68rem] font-medium uppercase tracking-[0.18em] text-zinc-500">
                Catalog creators
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {catalogCreators.map((creator) => (
                  <CreatorRow key={creator.id} creator={creator} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function CreatorRow({ creator }: { creator: CatalogCreator }) {
  const imageUrl = creator.profileImageUrl ?? creator.avatarUrl;
  const versionedUrl =
    imageUrl?.startsWith('/api/')
      ? `${imageUrl}?v=${new Date(creator.updatedAt).getTime()}`
      : imageUrl;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/15 p-4 transition-colors hover:border-white/15">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#171d2a]">
          {versionedUrl ? (
            <img src={versionedUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-sm font-bold text-indigo-300">
              {creator.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          {creator.isVerified ? (
            <a
              href={`/creators/${creator.slug}`}
              className="block truncate font-medium text-white hover:text-indigo-300"
            >
              {creator.name}
            </a>
          ) : (
            <div className="truncate font-medium text-white">{creator.name}</div>
          )}
          {creator.bio ? (
            <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{creator.bio}</div>
          ) : null}
        </div>
      </div>
      {creator.isVerified ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded bg-cyan-500/10 px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-cyan-300">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          Verified
        </span>
      ) : (
        <span className="shrink-0 rounded bg-zinc-700/50 px-2 py-1 text-xs text-zinc-500">
          Catalog
        </span>
      )}
    </div>
  );
}

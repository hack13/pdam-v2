import { useEffect, useRef, useState } from 'react';

interface Application {
  id: string;
  creatorId: string | null;
  requestedCreatorName: string;
  proofUrls: string[];
  applicantNote: string | null;
  status: string;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface LinkedCreator {
  id: string;
  name: string;
  slug: string;
}

interface SearchResult {
  id: string;
  name: string;
  slug: string;
  isClaimed: boolean;
  isClaimedByMe: boolean;
}

interface Props {
  initialIsCreator?: boolean;
  initialLinkedCreator?: LinkedCreator | null;
  initialPending?: Application | null;
  initialLatest?: Application | null;
}

export function CreatorOnboardingForm({
  initialIsCreator = false,
  initialLinkedCreator = null,
  initialPending = null,
  initialLatest = null,
}: Props) {
  const [isCreator, setIsCreator] = useState(initialIsCreator);
  const [linked, setLinked] = useState<LinkedCreator | null>(initialLinkedCreator);
  const [pending, setPending] = useState<Application | null>(initialPending);
  const [latest, setLatest] = useState<Application | null>(initialLatest);

  const [selectedCreator, setSelectedCreator] = useState<SearchResult | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newName, setNewName] = useState('');
  const [proofText, setProofText] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function refresh() {
    const res = await fetch('/api/creator/applications');
    if (!res.ok) return;
    const data = await res.json();
    setIsCreator(Boolean(data.isCreator));
    setLinked(data.linkedCreator);
    setPending(data.pendingApplication);
    setLatest(data.latestApplication);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim() || selectedCreator || pending) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/creators/search?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) return;
      const data = (await res.json()) as SearchResult[];
      setResults(data);
      setShowDropdown(true);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selectedCreator, pending]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    const requestedCreatorName = selectedCreator?.name || newName.trim();
    const proofUrls = proofText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    try {
      const res = await fetch('/api/creator/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorId: selectedCreator?.id ?? null,
          requestedCreatorName,
          proofUrls,
          applicantNote: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      setMessage('Application submitted. An admin will review it before you get creator access.');
      setSelectedCreator(null);
      setQuery('');
      setNewName('');
      setProofText('');
      setNote('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!confirm('Cancel your pending creator application?')) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/creator/applications', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      setMessage('Application cancelled.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setSaving(false);
    }
  }

  if (isCreator && linked && !pending) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-6">
          <h2 className="text-lg font-semibold text-white">Verified creator</h2>
          <p className="mt-1 text-sm text-zinc-300">
            Your account was approved and linked to{' '}
            <span className="font-medium text-white">{linked.name}</span>.
          </p>
          <p className="mt-3 text-xs text-zinc-500">
            To change which catalog creator you represent, submit a new application below. An admin
            must approve the change.
          </p>
        </div>
        <details className="rounded-xl border border-white/10 bg-white/5 p-6">
          <summary className="cursor-pointer text-sm font-medium text-indigo-300">
            Request a creator profile change
          </summary>
          <div className="mt-4">
            <ApplicationFields
              wrapRef={wrapRef}
              query={query}
              setQuery={setQuery}
              results={results}
              showDropdown={showDropdown}
              setShowDropdown={setShowDropdown}
              selectedCreator={selectedCreator}
              setSelectedCreator={setSelectedCreator}
              newName={newName}
              setNewName={setNewName}
              proofText={proofText}
              setProofText={setProofText}
              note={note}
              setNote={setNote}
              saving={saving}
              error={error}
              message={message}
              onSubmit={handleSubmit}
            />
          </div>
        </details>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
        <h2 className="text-lg font-semibold text-white">Application pending review</h2>
        <p className="mt-1 text-sm text-zinc-400">
          You requested to represent <span className="text-zinc-200">{pending.requestedCreatorName}</span>.
          An admin will verify your proof before granting creator access.
        </p>
        <ul className="mt-4 space-y-1 text-sm text-zinc-400">
          {(pending.proofUrls ?? []).map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">
                {url}
              </a>
            </li>
          ))}
        </ul>
        {pending.applicantNote && (
          <p className="mt-3 text-sm text-zinc-400">Note: {pending.applicantNote}</p>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          Submitted {new Date(pending.createdAt).toLocaleString()}
        </p>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="mt-4 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-50"
        >
          {saving ? 'Cancelling…' : 'Cancel application'}
        </button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {message && <p className="mt-3 text-sm text-emerald-400">{message}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-semibold text-white">Apply for creator access</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Claim a creator catalog profile and provide proof (Gumroad, Jinxxy, storefront, etc.). An
        admin must approve before you can list assets or use the creator dashboard.
      </p>

      {latest?.status === 'rejected' && (
        <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Your previous application for <strong>{latest.requestedCreatorName}</strong> was rejected.
          {latest.adminNote ? ` Reason: ${latest.adminNote}` : ''} You can submit a new one below.
        </div>
      )}

      <div className="mt-5">
        <ApplicationFields
          wrapRef={wrapRef}
          query={query}
          setQuery={setQuery}
          results={results}
          showDropdown={showDropdown}
          setShowDropdown={setShowDropdown}
          selectedCreator={selectedCreator}
          setSelectedCreator={setSelectedCreator}
          newName={newName}
          setNewName={setNewName}
          proofText={proofText}
          setProofText={setProofText}
          note={note}
          setNote={setNote}
          saving={saving}
          error={error}
          message={message}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}

function ApplicationFields({
  wrapRef,
  query,
  setQuery,
  results,
  showDropdown,
  setShowDropdown,
  selectedCreator,
  setSelectedCreator,
  newName,
  setNewName,
  proofText,
  setProofText,
  note,
  setNote,
  saving,
  error,
  message,
  onSubmit,
}: {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  query: string;
  setQuery: (v: string) => void;
  results: SearchResult[];
  showDropdown: boolean;
  setShowDropdown: (v: boolean) => void;
  selectedCreator: SearchResult | null;
  setSelectedCreator: (v: SearchResult | null) => void;
  newName: string;
  setNewName: (v: string) => void;
  proofText: string;
  setProofText: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  saving: boolean;
  error: string;
  message: string;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div ref={wrapRef} className="relative">
        <label className="mb-1 block text-sm text-zinc-400">Search existing creator</label>
        {selectedCreator ? (
          <div className="flex items-center justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm">
            <span className="text-white">{selectedCreator.name}</span>
            <button
              type="button"
              onClick={() => setSelectedCreator(null)}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Clear
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Start typing…"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
            />
            {showDropdown && (
              <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-white/10 bg-zinc-900 shadow-xl">
                {results.length === 0 && (
                  <p className="px-3 py-2 text-xs text-zinc-500">No matches</p>
                )}
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={r.isClaimed && !r.isClaimedByMe}
                    onClick={() => {
                      setSelectedCreator(r);
                      setNewName('');
                      setShowDropdown(false);
                      setQuery('');
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
                  >
                    <span>{r.name}</span>
                    {r.isClaimed && !r.isClaimedByMe ? (
                      <span className="text-xs text-zinc-500">Claimed</span>
                    ) : (
                      <span className="text-xs text-indigo-400">Select</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!selectedCreator && (
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Or request a new creator name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={100}
            placeholder="Your brand / creator name"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm text-zinc-400">
          Proof URLs <span className="text-zinc-600">(one per line — required)</span>
        </label>
        <textarea
          value={proofText}
          onChange={(e) => setProofText(e.target.value)}
          rows={3}
          required
          placeholder={'https://gumroad.com/yourshop\nhttps://jinxxy.com/yourprofile'}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-zinc-400">
          Note to admins <span className="text-zinc-600">(optional)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Anything that helps verify you own this creator identity"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {message && <p className="text-sm text-emerald-400">{message}</p>}

      <button
        type="submit"
        disabled={saving || (!selectedCreator && !newName.trim())}
        className="btn-primary disabled:opacity-50"
      >
        {saving ? 'Submitting…' : 'Submit for admin review'}
      </button>
    </form>
  );
}

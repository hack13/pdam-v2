import { useEffect, useState } from 'react';

type FeedbackStatus = 'new' | 'in_progress' | 'resolved' | 'closed';

interface FeedbackRow {
  id: string;
  category: 'bug' | 'idea' | 'general';
  message: string;
  pageUrl: string | null;
  status: FeedbackStatus;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reporter: { id: string; name: string; email: string };
  attachments: { id: string; fileName: string; mimeType: string; fileSize: number }[];
}

const statusOptions: { value: FeedbackStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const statusStyles: Record<FeedbackStatus, string> = {
  new: 'border-cyan-400/25 bg-cyan-400/[0.09] text-cyan-200',
  in_progress: 'border-amber-400/25 bg-amber-400/[0.09] text-amber-200',
  resolved: 'border-emerald-400/25 bg-emerald-400/[0.09] text-emerald-200',
  closed: 'border-zinc-400/20 bg-zinc-400/[0.08] text-zinc-300',
};

const categoryStyles: Record<FeedbackRow['category'], string> = {
  bug: 'text-rose-300',
  idea: 'text-violet-300',
  general: 'text-zinc-400',
};

function statusLabel(status: FeedbackStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FeedbackAdmin() {
  const [filter, setFilter] = useState<FeedbackStatus | ''>('new');
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, FeedbackStatus>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const query = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const response = await fetch(`/api/admin/feedback${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Feedback could not be loaded.');
      const entries = data.feedback ?? [];
      setFeedback(entries);
      setNotes(Object.fromEntries(entries.map((item: FeedbackRow) => [item.id, item.adminNote ?? ''])));
      setStatuses(Object.fromEntries(entries.map((item: FeedbackRow) => [item.id, item.status])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Feedback could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [filter]);

  async function save(item: FeedbackRow) {
    const status = statuses[item.id] ?? item.status;
    const adminNote = notes[item.id] ?? '';
    setSavingId(item.id);
    setError('');
    try {
      const response = await fetch(`/api/admin/feedback/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNote }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Feedback could not be updated.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Feedback could not be updated.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.16em] text-violet-300">Triage workspace</p>
          <p className="mt-1 text-sm text-zinc-400">Keep beta reports moving and record the decision for the team.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Show
          <select value={filter} onChange={(event) => setFilter(event.target.value as FeedbackStatus | '')} className="rounded-lg border border-white/10 bg-[#0d111a] px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60">
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            <option value="">All feedback</option>
          </select>
        </label>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-300">{error}</p>}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-10 text-center text-sm text-zinc-400">Loading feedback…</div>
      ) : feedback.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-violet-300/20 bg-violet-400/[0.025] p-10 text-center">
          <p className="text-sm font-medium text-zinc-300">No {filter ? statusLabel(filter).toLowerCase() : ''} feedback right now.</p>
          <p className="mt-1 text-sm text-zinc-500">New beta reports will appear here with their screenshots and page context.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedback.map((item) => {
            const expanded = expandedId === item.id;
            const selectedStatus = statuses[item.id] ?? item.status;
            const note = notes[item.id] ?? '';
            const changed = selectedStatus !== item.status || note !== (item.adminNote ?? '');
            return (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#121722] shadow-sm shadow-black/20">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-mono text-[0.64rem] font-medium uppercase tracking-[0.14em] ${categoryStyles[item.category]}`}>{item.category}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[0.67rem] font-medium ${statusStyles[item.status]}`}>{statusLabel(item.status)}</span>
                      {item.attachments.length > 0 && <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[0.67rem] text-zinc-400">{item.attachments.length} screenshot{item.attachments.length === 1 ? '' : 's'}</span>}
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-200">{item.message}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span><span className="text-zinc-400">{item.reporter.name}</span> · {item.reporter.email}</span>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                      {item.pageUrl && <span className="max-w-full truncate font-mono text-[0.68rem] text-zinc-600" title={item.pageUrl}>{item.pageUrl}</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)} className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white">
                    {expanded ? 'Hide details' : 'Review'}
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-white/[0.08] bg-black/[0.12] p-5">
                    {item.attachments.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-zinc-200">Attached screenshots</h3>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {item.attachments.map((attachment) => {
                            const url = `/api/admin/feedback/${item.id}/attachments/${attachment.id}`;
                            return (
                              <a key={attachment.id} href={url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-white/10 bg-[#0d111a] transition-colors hover:border-cyan-300/35">
                                <img src={url} alt={`Attached screenshot: ${attachment.fileName}`} className="aspect-video w-full bg-black object-contain" loading="lazy" />
                                <span className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-zinc-400 group-hover:text-zinc-200"><span className="truncate">{attachment.fileName}</span><span className="shrink-0 text-zinc-600">{fileSize(attachment.fileSize)}</span></span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="mt-5 grid gap-4 md:grid-cols-[11rem_1fr_auto] md:items-end">
                      <label className="block text-sm text-zinc-400">
                        Status
                        <select value={selectedStatus} onChange={(event) => setStatuses((current) => ({ ...current, [item.id]: event.target.value as FeedbackStatus }))} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0d111a] px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60">
                          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="block text-sm text-zinc-400">
                        Internal note
                        <textarea value={note} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={5000} rows={2} placeholder="Decision, owner, or follow-up…" className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-[#0d111a] px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/60" />
                      </label>
                      <button type="button" disabled={!changed || savingId === item.id} onClick={() => void save(item)} className="rounded-lg bg-indigo-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-45">
                        {savingId === item.id ? 'Saving…' : 'Save review'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

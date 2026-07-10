import { useEffect, useState } from 'react';

interface ApplicationRow {
  id: string;
  requestedCreatorName: string;
  creatorId: string | null;
  proofUrls: string[] | null;
  applicantNote: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  applicant: { id: string; name: string; email: string; role: string } | null;
  catalogCreator: { id: string; name: string; slug: string } | null;
}

export function CreatorApplicationsAdmin() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reviewId, setReviewId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await fetch(`/api/admin/creator-applications${qs}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load');
      }
      const data = await res.json();
      setApplications(data.applications ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [statusFilter]);

  async function review(id: string, action: 'approve' | 'reject') {
    setActingId(id);
    setError('');
    try {
      const res = await fetch(`/api/admin/creator-applications/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, adminNote: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Review failed');
      setReviewId(null);
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Creator applications</h2>
          <p className="text-sm text-zinc-400">
            Verify proof before granting creator access and catalog enrollment.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
          <option value="">All</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : applications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-10 text-center text-sm text-zinc-500">
          No applications in this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <div key={app.id} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-white">{app.requestedCreatorName}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">
                    {app.applicant
                      ? `${app.applicant.name} · ${app.applicant.email}`
                      : 'Unknown applicant'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Status: {app.status} · Submitted {new Date(app.createdAt).toLocaleString()}
                  </p>
                </div>
                {app.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReviewId(app.id);
                        setNote('');
                      }}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300"
                    >
                      Review
                    </button>
                  </div>
                )}
              </div>

              <ul className="mt-3 space-y-1 text-sm">
                {(app.proofUrls ?? []).map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 break-all"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
              {app.applicantNote && (
                <p className="mt-2 text-sm text-zinc-400">Applicant note: {app.applicantNote}</p>
              )}
              {app.adminNote && (
                <p className="mt-2 text-sm text-zinc-500">Admin note: {app.adminNote}</p>
              )}

              {reviewId === app.id && (
                <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-black/20 p-4">
                  <label className="block text-sm text-zinc-400">
                    Admin note <span className="text-zinc-600">(optional, shown on reject)</span>
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                    placeholder="Reason or verification notes"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actingId === app.id}
                      onClick={() => review(app.id, 'approve')}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-200 disabled:opacity-50"
                    >
                      {actingId === app.id ? 'Working…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={actingId === app.id}
                      onClick={() => review(app.id, 'reject')}
                      className="rounded-lg border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-sm text-red-300 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewId(null)}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

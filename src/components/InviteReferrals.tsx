import { useEffect, useState } from 'react';

type Invite = {
  code: string;
  availableAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

type InvitesResponse = {
  hasPermission: boolean;
  canGenerateInvites: boolean;
  generatedCount: number;
  generationLimit: number | null;
  remaining: number | null;
  unlimited: boolean;
  invites: Invite[];
};

export function InviteReferrals() {
  const [data, setData] = useState<InvitesResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  async function loadInvites() {
    const response = await fetch('/api/invites');
    if (!response.ok) throw new Error('Failed to load invites');
    setData(await response.json() as InvitesResponse);
  }

  useEffect(() => {
    void loadInvites().catch(() => {
      setData({
        hasPermission: false,
        canGenerateInvites: false,
        generatedCount: 0,
        generationLimit: 0,
        remaining: 0,
        unlimited: false,
        invites: [],
      });
    });
  }, []);

  async function generateInvite() {
    setGenerating(true);
    setError('');
    try {
      const response = await fetch('/api/invites', { method: 'POST' });
      const payload = await response.json() as { error?: string; invite?: Invite };
      if (!response.ok) throw new Error(payload.error || 'Failed to generate invite');
      await loadInvites();
      if (payload.invite) {
        const link = `${window.location.origin}/signup?invite=${payload.invite.code}`;
        await navigator.clipboard.writeText(link);
        setCopied(payload.invite.code);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite');
    } finally {
      setGenerating(false);
    }
  }

  if (data === null) {
    return <p className="text-sm text-zinc-500">Loading invite codes…</p>;
  }

  const atLimit = data.hasPermission && !data.canGenerateInvites;
  const quotaLabel = data.unlimited
    ? `${data.generatedCount} generated`
    : data.hasPermission
      ? `${data.generatedCount} of ${data.generationLimit ?? 0} used`
      : null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Beta invites</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {data.hasPermission
              ? 'Generate single-use invite links to share. Your admin sets how many you can create in total.'
              : 'Invite generation is granted by an admin. You can still manage any codes you already have.'}
          </p>
          {quotaLabel && (
            <p className="mt-1 text-xs text-zinc-500">{quotaLabel}</p>
          )}
        </div>
        {data.hasPermission && (
          <button
            type="button"
            onClick={() => void generateInvite()}
            disabled={generating || atLimit}
            className="rounded-md border border-indigo-400/30 px-3 py-1.5 text-sm text-indigo-300 hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? 'Generating…' : atLimit ? 'Limit reached' : 'Generate invite'}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {!data.hasPermission && data.invites.length === 0 && (
        <p className="mt-4 text-sm text-zinc-500">
          You do not currently have permission to generate invites.
        </p>
      )}

      {data.invites.length > 0 && (
        <div className="mt-4 space-y-3">
          {data.invites.map((invite, index) => {
            const accepted = !!invite.acceptedAt;
            return (
              <div
                key={invite.code}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/10 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-white">Invite {index + 1}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {accepted
                      ? `Used ${new Date(invite.acceptedAt!).toLocaleDateString()}`
                      : `Ready · created ${new Date(invite.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
                {!accepted && (
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(`${window.location.origin}/signup?invite=${invite.code}`)
                        .then(() => setCopied(invite.code))
                    }
                    className="rounded-md border border-indigo-400/30 px-3 py-1.5 text-sm text-indigo-300 hover:bg-indigo-500/10"
                  >
                    {copied === invite.code ? 'Copied' : 'Copy invite link'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data.hasPermission && data.invites.length === 0 && (
        <p className="mt-4 text-sm text-zinc-500">No invites yet. Generate one to get a shareable link.</p>
      )}
    </div>
  );
}

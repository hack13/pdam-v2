import { useEffect, useState } from 'react';

type Invite = { code: string; availableAt: string; acceptedAt: string | null };

export function InviteReferrals() {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/invites').then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json() as { invites: Invite[] };
      setInvites(data.invites);
    }).catch(() => setInvites([]));
  }, []);

  if (invites === null) return <p className="text-sm text-zinc-500">Loading your referrals…</p>;

  const now = Date.now();
  return (
    <div>
      <h2 className="text-lg font-semibold text-white">Beta referrals</h2>
      <p className="mt-1 text-sm text-zinc-400">You receive three single-use invites, released one every three days after joining.</p>
      <div className="mt-4 space-y-3">
        {invites.map((invite, index) => {
          const available = new Date(invite.availableAt).getTime() <= now;
          const accepted = !!invite.acceptedAt;
          return <div key={invite.code} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/10 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Referral {index + 1}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{accepted ? 'Used' : available ? 'Ready to share' : `Available ${new Date(invite.availableAt).toLocaleDateString()}`}</p>
            </div>
            {available && !accepted && <button type="button" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/signup?invite=${invite.code}`).then(() => setCopied(invite.code))} className="rounded-md border border-indigo-400/30 px-3 py-1.5 text-sm text-indigo-300 hover:bg-indigo-500/10">{copied === invite.code ? 'Copied' : 'Copy invite link'}</button>}
          </div>;
        })}
      </div>
    </div>
  );
}

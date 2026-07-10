import { useState } from 'react';

interface PurchaseLink {
  id: string;
  productUrl: string;
  label: string | null;
  marketplace: { id: string; name: string; slug: string } | null;
}

interface Props {
  listingId: string;
  purchaseLinks: PurchaseLink[];
  alreadyOwned: boolean;
  linkedProductId: string | null;
  isAuthenticated: boolean;
}

export function OwnershipClaimForm({
  listingId,
  purchaseLinks,
  alreadyOwned,
  linkedProductId,
  isAuthenticated,
}: Props) {
  const [marketplaceSourceId, setMarketplaceSourceId] = useState(
    purchaseLinks[0]?.marketplace?.id ?? '',
  );
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ linkedProductId: string; message: string } | null>(
    alreadyOwned && linkedProductId
      ? { linkedProductId, message: 'This asset is already in your library.' }
      : null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAuthenticated) {
      window.location.href = `/login?redirect=/gallery/${listingId}`;
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/gallery/${listingId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceSourceId, licenseKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification failed');
      }
      setSuccess({
        linkedProductId: data.linkedProductId,
        message: data.message || 'Ownership verified.',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-6">
        <h2 className="text-lg font-semibold text-white">You own this</h2>
        <p className="mt-1 text-sm text-zinc-300">{success.message}</p>
        <a
          href={`/assets/${success.linkedProductId}`}
          className="btn-primary mt-4 inline-flex"
        >
          Open in library
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-semibold text-white">I own this</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Select the marketplace you purchased from and enter your license key. We&apos;ll verify
        with the creator and add a linked copy to your library.
      </p>

      {!isAuthenticated ? (
        <div className="mt-4">
          <a
            href={`/login?redirect=/gallery/${listingId}`}
            className="btn-primary inline-flex"
          >
            Sign in to verify ownership
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="claim-marketplace" className="mb-1 block text-sm text-zinc-400">
              Marketplace
            </label>
            <select
              id="claim-marketplace"
              value={marketplaceSourceId}
              onChange={(e) => setMarketplaceSourceId(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
            >
              {purchaseLinks.map((link) => (
                <option key={link.id} value={link.marketplace?.id ?? ''}>
                  {link.label || link.marketplace?.name || 'Marketplace'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="claim-license" className="mb-1 block text-sm text-zinc-400">
              License key
            </label>
            <input
              id="claim-license"
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              required
              placeholder="Paste your license key"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-indigo-500/50"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" disabled={loading || !marketplaceSourceId} className="btn-primary">
            {loading ? 'Verifying…' : 'Verify ownership'}
          </button>
        </form>
      )}
    </div>
  );
}

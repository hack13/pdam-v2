interface PurchaseLink {
  id: string;
  productUrl: string;
  label: string | null;
  marketplace: { id: string; name: string; slug: string } | null;
}

interface Props {
  listingId: string;
  purchaseLinks: PurchaseLink[];
}

export function GalleryPurchaseLinks({ listingId, purchaseLinks }: Props) {
  async function handleClick(link: PurchaseLink) {
    try {
      await fetch(`/api/gallery/${listingId}/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseLinkId: link.id }),
      });
    } catch {
      // still open the link even if analytics fail
    }
    window.open(link.productUrl, '_blank', 'noopener,noreferrer');
  }

  if (purchaseLinks.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No purchase links available yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-zinc-300">Available from</h2>
      <div className="grid gap-2">
        {purchaseLinks.map((link) => (
          <button
            key={link.id}
            type="button"
            onClick={() => handleClick(link)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:border-indigo-400/40 hover:bg-indigo-500/10"
          >
            <span>{link.label || link.marketplace?.name || 'Marketplace'}</span>
            <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

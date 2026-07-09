import { useState } from 'react';
import { AssetEditForm } from './AssetEditForm';

interface CreatorEntry {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  assetId: string;
  assetTitle: string;
  assetDescription: string;
  assetTags?: string[];
  assetCreators?: CreatorEntry[];
  assetLicenseKey?: string;
  assetMarketplaceSourceId?: string;
  assetProductUrl?: string;
  thumbnailUrl?: string;
}

export function EditAssetButton({
  assetId,
  assetTitle,
  assetDescription,
  assetTags,
  assetCreators,
  assetLicenseKey,
  assetMarketplaceSourceId,
  assetProductUrl,
  thumbnailUrl,
}: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Edit
      </button>

      {editing && (
        <AssetEditForm
          productId={assetId}
          initialTitle={assetTitle}
          initialDescription={assetDescription}
          initialTags={assetTags ?? []}
          initialCreators={assetCreators ?? []}
          initialLicenseKey={assetLicenseKey ?? ''}
          initialMarketplaceSourceId={assetMarketplaceSourceId ?? ''}
          initialProductUrl={assetProductUrl ?? ''}
          thumbnailUrl={thumbnailUrl}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

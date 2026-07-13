import { useRef, useState, type ChangeEvent } from 'react';

interface CreatorProfile {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  avatarUrl: string | null;
  profileImageUrl: string | null;
  headerImageUrl: string | null;
}

interface Props {
  creator: CreatorProfile;
}

type MediaKind = 'profile' | 'header';

export function CreatorProfileEditor({ creator }: Props) {
  const [bio, setBio] = useState(creator.bio ?? '');
  const [profileImageUrl, setProfileImageUrl] = useState(
    creator.profileImageUrl ?? creator.avatarUrl ?? '',
  );
  const [hasCustomProfileImage, setHasCustomProfileImage] = useState(!!creator.profileImageUrl);
  const [headerImageUrl, setHeaderImageUrl] = useState(creator.headerImageUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<MediaKind | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const profileInput = useRef<HTMLInputElement>(null);
  const headerInput = useRef<HTMLInputElement>(null);

  async function saveBio(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/creator/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save profile');
      setBio(data.linkedCreator.bio ?? '');
      setMessage('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(kind: MediaKind, file: File | null) {
    if (!file) return;
    setUploading(kind);
    setError('');
    setMessage('');
    const form = new FormData();
    form.append('image', file);
    try {
      const response = await fetch(`/api/creator/profile-media/${kind}`, {
        method: 'POST',
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not upload image');
      if (kind === 'profile') {
        setProfileImageUrl(data.url);
        setHasCustomProfileImage(true);
      } else setHeaderImageUrl(data.url);
      setMessage(`${kind === 'profile' ? 'Profile picture' : 'Header image'} updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload image');
    } finally {
      setUploading(null);
    }
  }

  async function removeImage(kind: MediaKind) {
    setUploading(kind);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/creator/profile-media/${kind}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not remove image');
      if (kind === 'profile') {
        setProfileImageUrl(creator.avatarUrl ?? '');
        setHasCustomProfileImage(false);
      } else setHeaderImageUrl('');
      setMessage(`${kind === 'profile' ? 'Profile picture' : 'Header image'} removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove image');
    } finally {
      setUploading(null);
    }
  }

  function fileChange(kind: MediaKind, e: ChangeEvent<HTMLInputElement>) {
    void uploadImage(kind, e.target.files?.[0] ?? null);
    e.target.value = '';
  }

  return (
    <section className="app-panel-raised overflow-hidden">
      <div className="relative h-44 overflow-hidden border-b border-white/10 bg-[#0d121c] sm:h-56">
        {headerImageUrl ? (
          <img src={headerImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_10%,rgba(126,63,242,0.35),transparent_38%),radial-gradient(circle_at_80%_45%,rgba(14,165,233,0.18),transparent_34%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#121722]/75 via-transparent to-transparent" />
        <button
          type="button"
          onClick={() => headerInput.current?.click()}
          disabled={uploading !== null}
          className="absolute right-4 top-4 rounded-xl border border-white/15 bg-[#090d14]/80 px-3 py-2 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-[#121722] disabled:opacity-50"
        >
          {uploading === 'header' ? 'Uploading…' : headerImageUrl ? 'Replace header' : 'Add header image'}
        </button>
        <input ref={headerInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif,image/tiff" className="hidden" onChange={(e) => fileChange('header', e)} />
      </div>

      <div className="relative px-5 pb-6 sm:px-7">
        <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
          <button
            type="button"
            onClick={() => profileInput.current?.click()}
            disabled={uploading !== null}
            className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-[#121722] bg-[#171d2a] shadow-2xl sm:h-28 sm:w-28"
            aria-label="Change profile picture"
          >
            {profileImageUrl ? (
              <img src={profileImageUrl} alt={`${creator.name} profile`} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center font-display text-3xl font-bold text-indigo-300">{creator.name.slice(0, 1).toUpperCase()}</span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-semibold text-transparent transition-colors group-hover:bg-black/55 group-hover:text-white">
              {uploading === 'profile' ? 'Uploading…' : 'Change'}
            </span>
          </button>
          <input ref={profileInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif,image/tiff" className="hidden" onChange={(e) => fileChange('profile', e)} />
          <a href={`/creators/${creator.slug}`} target="_blank" rel="noreferrer" className="btn-secondary !px-4 !py-2.5">
            View public profile <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div className="mt-5">
          <p className="font-display text-xl font-semibold text-white">{creator.name}</p>
          <p className="mt-1 font-mono text-xs text-zinc-500">pdam.app/creators/{creator.slug}</p>
        </div>

        <form onSubmit={saveBio} className="mt-6 space-y-3">
          <div>
            <div className="mb-2 flex items-center justify-between gap-4">
              <label htmlFor="creator-bio" className="text-sm font-medium text-zinc-300">About your work</label>
              <span className="font-mono text-[0.65rem] text-zinc-600">{bio.length}/1000</span>
            </div>
            <textarea
              id="creator-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 1000))}
              rows={5}
              placeholder="Tell visitors what you make, who it is for, and where they can find you."
              className="field-control resize-y"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary !px-5 !py-2.5 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            {hasCustomProfileImage && (
              <button type="button" onClick={() => void removeImage('profile')} disabled={uploading !== null} className="text-xs text-zinc-500 hover:text-white disabled:opacity-50">Remove profile picture</button>
            )}
            {headerImageUrl && (
              <button type="button" onClick={() => void removeImage('header')} disabled={uploading !== null} className="text-xs text-zinc-500 hover:text-white disabled:opacity-50">Remove header image</button>
            )}
          </div>
          {message && <p role="status" className="text-sm text-emerald-400">{message}</p>}
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        </form>
      </div>
    </section>
  );
}

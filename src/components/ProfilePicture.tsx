import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';

interface Props {
  currentImageUrl: string;
  fallbackUrl: string;
}

type Status = 'idle' | 'uploading' | 'success' | 'error';

export function ProfilePicture({ currentImageUrl, fallbackUrl }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayUrl = previewUrl || fallbackUrl;

  async function uploadAvatar(file: File) {
    setStatus('uploading');
    setError(null);

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const res = await fetch('/api/user/avatar', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStatus('error');
    }
  }

  async function removeAvatar() {
    setStatus('uploading');
    setError(null);

    try {
      const res = await fetch('/api/user/avatar', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Remove failed');
      }

      setPreviewUrl(null);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
      setStatus('error');
    }
  }

  function handleFile(file: File | null) {
    if (!file || !file.type.startsWith('image/')) return;
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    uploadAvatar(file);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    handleFile(file);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    handleFile(file);
  }

  return (
    <div className="group relative">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative h-[100px] w-[100px] cursor-pointer overflow-hidden rounded-full border-2 border-dashed transition-colors ${
          dragOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-white/20 hover:border-indigo-400'
        }`}
      >
        <img
          src={displayUrl}
          alt="Profile picture"
          className="h-full w-full object-cover"
        />

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleChange}
        />

        {status === 'uploading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
          <span className="scale-0 text-sm font-medium text-white transition-transform group-hover:scale-100">
            Change
          </span>
        </div>
      </div>

      <div className="invisible absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-zinc-900/95 px-3 py-2 text-center opacity-0 shadow-lg backdrop-blur transition-all group-hover:visible group-hover:opacity-100">
        <p className="text-xs text-zinc-400">PNG, JPG, GIF or WebP · max 10MB</p>
        {previewUrl && previewUrl !== fallbackUrl && (
          <button
            type="button"
            onClick={removeAvatar}
            disabled={status === 'uploading'}
            className="mt-1 text-xs text-zinc-400 underline hover:text-zinc-200 disabled:opacity-50"
          >
            Remove picture
          </button>
        )}
        {status === 'error' && error && (
          <p className="mt-1 text-xs text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}

import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';

interface Props {
  preview: string | null;
  onFileChange: (file: File | null) => void;
}

export function ThumbnailPicker({ preview, onFileChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    onFileChange(file);
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

  function handleClear() {
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium text-zinc-300">Thumbnail</label>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors ${
          dragOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-white/10 bg-white/5 hover:border-white/20'
        }`}
      >
        {preview ? (
          <>
            <img src={preview} alt="Thumbnail preview" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              aria-label="Remove thumbnail"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <svg className="h-8 w-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0 0V8m0 4h4m-4 0H8m12 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2m16 0a2 2 0 00-2-2h-2.5l-1.5-2h-5L7.5 14H5a2 2 0 00-2 2" />
            </svg>
            <p className="text-sm text-zinc-400">Click or drop image here</p>
            <p className="text-xs text-zinc-600">PNG, JPG, GIF, WebP (max 10MB)</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleChange}
        />
      </div>
    </div>
  );
}

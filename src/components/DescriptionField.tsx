import { useRef, useState, type ClipboardEvent, type ChangeEvent } from 'react';

interface DescriptionFieldProps {
  productId: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  rows?: number;
  textareaClassName?: string;
}

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  currentValue: string,
  insertion: string,
  onChange: (value: string) => void,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const nextValue = `${currentValue.slice(0, start)}${insertion}${currentValue.slice(end)}`;
  onChange(nextValue);

  const cursor = start + insertion.length;
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
}

export function DescriptionField({
  productId,
  value,
  onChange,
  disabled = false,
  id = 'description',
  rows = 4,
  textareaClassName = '',
}: DescriptionFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadAndInsert(file: File) {
    if (disabled || uploading) return;

    setUploadError(null);
    setUploading(true);

    try {
      const form = new FormData();
      form.append('image', file);

      const response = await fetch(`/api/assets/${productId}/description-images`, {
        method: 'POST',
        body: form,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to upload image');
      }

      const image = (await response.json()) as { url: string };
      const alt = file.name.replace(/\.[^.]+$/, '') || 'image';
      const markdown = `\n![${alt}](${image.url})\n`;

      if (textareaRef.current) {
        insertAtCursor(textareaRef.current, value, markdown, onChange);
      } else {
        onChange(`${value}${markdown}`);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void uploadAndInsert(file);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) {
          void uploadAndInsert(file);
        }
        return;
      }
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="block text-sm font-medium text-zinc-300">
          Description
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled || uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {uploading ? 'Uploading...' : 'Insert image'}
          </button>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPaste={handlePaste}
        rows={rows}
        className={textareaClassName}
        placeholder="Describe your asset..."
        disabled={disabled || uploading}
      />

      <p className="mt-1 text-xs text-zinc-500">
        Markdown supported: **bold**, *italic*, lists, links, and images.
      </p>

      {uploadError && (
        <p className="mt-1 text-xs text-red-400">{uploadError}</p>
      )}
    </div>
  );
}

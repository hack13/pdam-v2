import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type Quill from 'quill';

interface QuillEditorProps {
  productId?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function QuillEditor({
  productId,
  value,
  onChange,
  disabled = false,
  placeholder = 'Describe your asset...',
  className = '',
}: QuillEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!editorRef.current || quillRef.current) return;

    let cancelled = false;

    async function initQuill() {
      const QuillModule = (await import('quill')).default;
      if (cancelled || !editorRef.current) return;

      quillRef.current = new QuillModule(editorRef.current, {
        theme: 'snow',
        placeholder,
        readOnly: disabled,
        modules: {
          toolbar: {
            container: [
              [{ header: [1, 2, 3, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              [{ list: 'ordered' }, { list: 'bullet' }],
              ['link', 'image'],
              ['clean'],
            ],
            handlers: {
              image: function () {
                if (productId && fileInputRef.current) {
                  fileInputRef.current.click();
                }
              },
            },
          },
        },
      });

      const quill = quillRef.current;

      // Set initial content if provided
      if (value) {
        const delta = quill.clipboard.convert({ html: value });
        quill.setContents(delta, 'silent');
      }

      quill.on('text-change', () => {
        const html = quill.root.innerHTML;
        onChange(html === '<p><br></p>' ? '' : html);
      });
    }

    void initQuill();

    return () => {
      cancelled = true;
      quillRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!quillRef.current) return;

    const quill = quillRef.current;
    const currentHtml = quill.root.innerHTML;
    
    if (value !== currentHtml && value !== (currentHtml === '<p><br></p>' ? '' : currentHtml)) {
      const delta = quill.clipboard.convert({ html: value });
      quill.setContents(delta, 'silent');
    }
  }, [value]);

  useEffect(() => {
    if (!quillRef.current) return;
    quillRef.current.enable(!disabled);
  }, [disabled]);

  async function uploadAndInsert(file: File) {
    if (!productId || disabled || uploading) return;

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
      
      const quill = quillRef.current;
      if (quill) {
        const range = quill.getSelection(true);
        quill.insertEmbed(range.index, 'image', image.url);
        quill.setSelection(range.index + 1);
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

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || uploading}
      />
      
      <div ref={editorRef} className="quill-editor" />

      {uploadError && (
        <p className="mt-1 text-xs text-red-400">{uploadError}</p>
      )}
    </div>
  );
}

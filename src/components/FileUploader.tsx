import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { uploadFile, type UploadProgress } from '../lib/multipart-upload';

interface Props {
  productId: string;
  versionId: string;
  existingFiles: { id: string; fileName: string; fileSize: number; mimeType: string }[];
  onFilesUploaded: () => void;
  readOnly?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatProgress(progress: UploadProgress): string {
  const pct = progress.total > 0 ? Math.round((progress.bytes / progress.total) * 100) : 0;
  if (progress.phase === 'hashing') {
    return `Computing hash… ${pct}%`;
  }
  if (progress.phase === 'completing') {
    return 'Finalizing upload…';
  }
  return `Uploading… ${pct}% (${formatSize(progress.bytes)} / ${formatSize(progress.total)})`;
}

export function FileUploader({
  productId,
  versionId,
  existingFiles,
  onFilesUploaded,
  readOnly = false,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; detail?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deletingFile = deletingFileId
    ? existingFiles.find((f) => f.id === deletingFileId)
    : null;

  async function deleteFile() {
    if (!deletingFileId) return;
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/assets/${productId}/versions/${versionId}/files?blobId=${encodeURIComponent(deletingFileId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to delete file');
      }
      setDeletingFileId(null);
      onFilesUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setDeleting(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setError(null);
    setUploading(true);
    setProgress({ current: 0, total: fileArray.length });

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setProgress({
          current: i,
          total: fileArray.length,
          detail: `Preparing ${file.name}…`,
        });

        await uploadFile({
          file,
          productId,
          versionId,
          onProgress: (uploadProgress) => {
            setProgress({
              current: i,
              total: fileArray.length,
              detail: `${file.name}: ${formatProgress(uploadProgress)}`,
            });
          },
        });

        setProgress({
          current: i + 1,
          total: fileArray.length,
          detail: undefined,
        });
      }
      if (inputRef.current) inputRef.current.value = '';
      onFilesUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  function handleRemoveClick(e: React.MouseEvent, fileId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDeletingFileId(fileId);
  }

  return (
    <div className="space-y-3">
      {existingFiles.length > 0 && (
        <ul className="space-y-1.5">
          {existingFiles.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileIcon mimeType={file.mimeType} />
                <a
                  href={`/api/assets/${productId}/versions/${versionId}/files?blobId=${file.id}`}
                  className="truncate text-sm text-zinc-200 hover:text-white transition-colors"
                  title={`Download ${file.fileName}`}
                >
                  {file.fileName}
                </a>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-zinc-500">{formatSize(file.fileSize)}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = `/api/assets/${productId}/versions/${versionId}/files?blobId=${file.id}`;
                  }}
                  className="rounded p-1 text-zinc-500 transition-colors hover:bg-blue-500/10 hover:text-blue-400"
                  aria-label={`Download ${file.fileName}`}
                  title="Download file"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => handleRemoveClick(e, file.id)}
                    className="rounded p-1 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    aria-label={`Remove ${file.fileName}`}
                    title="Remove file"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer items-center justify-center rounded-lg border border-dashed px-4 py-3 text-sm transition-colors ${
          dragOver
            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
            : 'border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/20 hover:text-zinc-400'
        }`}
      >
        {uploading && progress ? (
          <span className="text-center">
            {progress.detail ?? `Uploading ${progress.current + 1}/${progress.total} file(s)…`}
          </span>
        ) : (
          <span>Drop files here or click to upload</span>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleChange}
          disabled={uploading}
        />
      </div>
      )}

      {readOnly && existingFiles.length === 0 && (
        <p className="text-sm text-zinc-500">No files in this version.</p>
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {deletingFileId && deletingFile && (
        <ConfirmDialog
          title="Remove File"
          confirmLabel="Remove"
          loading={deleting}
          onClose={() => !deleting && setDeletingFileId(null)}
          onConfirm={deleteFile}
          message={
            <>
              Are you sure you want to remove{' '}
              <span className="font-medium text-white break-all">{deletingFile.fileName}</span>?
            </>
          }
          description="This will permanently remove the file from this version. If no other versions reference it, the underlying file will also be deleted from storage."
        />
      )}
    </div>
  );
}

function FileIcon({ mimeType: _mimeType }: { mimeType: string }) {
  return (
    <svg className="h-4 w-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

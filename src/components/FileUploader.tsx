import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
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

type QueueStatus = 'queued' | UploadProgress['phase'] | 'stalled' | 'failed' | 'complete';

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  bytes: number;
  total: number;
  error?: string;
  lastActivity: number;
  attempt: number;
}

const STALL_AFTER_MS = 15_000;

function statusLabel(item: QueueItem): string {
  const percent = item.total > 0 ? Math.round((item.bytes / item.total) * 100) : 0;
  if (item.status === 'hashing') return `Checking file · ${percent}%`;
  if (item.status === 'uploading') return `${percent}% · ${formatSize(item.bytes)} of ${formatSize(item.total)}`;
  if (item.status === 'completing') return 'Finalizing';
  if (item.status === 'processing') return 'Processing';
  if (item.status === 'stalled') return `No progress detected · ${percent}%`;
  if (item.status === 'failed') return item.error ?? 'Upload failed';
  if (item.status === 'complete') return 'Uploaded';
  return 'Waiting to upload';
}

export function FileUploader({
  productId,
  versionId,
  existingFiles,
  onFilesUploaded,
  readOnly = false,
}: Props) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const processingRef = useRef(false);
  const controllersRef = useRef(new Map<string, AbortController>());
  const [dragOver, setDragOver] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deletingFile = deletingFileId
    ? existingFiles.find((f) => f.id === deletingFileId)
    : null;

  function replaceQueue(next: QueueItem[]): void {
    queueRef.current = next;
    setQueue(next);
  }

  function updateQueueItem(id: string, update: Partial<QueueItem>): void {
    replaceQueue(queueRef.current.map((item) => item.id === id ? { ...item, ...update } : item));
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      const stalled = queueRef.current.map((item) => (
        item.status === 'uploading' && now - item.lastActivity >= STALL_AFTER_MS
          ? { ...item, status: 'stalled' as const }
          : item
      ));
      if (stalled.some((item, index) => item !== queueRef.current[index])) replaceQueue(stalled);
    }, 2_000);

    return () => {
      window.clearInterval(timer);
      controllersRef.current.forEach((controller) => controller.abort());
    };
  }, []);

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

  async function processQueue(): Promise<void> {
    if (processingRef.current) return;
    processingRef.current = true;
    let uploadedAny = false;

    try {
      for (;;) {
        const item = queueRef.current.find((entry) => entry.status === 'queued');
        if (!item) break;

        const attempt = item.attempt + 1;
        const controller = new AbortController();
        controllersRef.current.set(item.id, controller);
        updateQueueItem(item.id, {
          status: 'hashing',
          bytes: 0,
          error: undefined,
          lastActivity: Date.now(),
          attempt,
        });

        try {
          await uploadFile({
            file: item.file,
            productId,
            versionId,
            signal: controller.signal,
            onProgress: (progress) => {
              const current = queueRef.current.find((entry) => entry.id === item.id);
              if (!current || current.attempt !== attempt) return;
              updateQueueItem(item.id, {
                status: progress.phase,
                bytes: progress.bytes,
                total: progress.total,
                lastActivity: Date.now(),
              });
            },
          });

          const current = queueRef.current.find((entry) => entry.id === item.id);
          if (current?.attempt === attempt) {
            updateQueueItem(item.id, {
              status: 'complete',
              bytes: item.file.size,
              lastActivity: Date.now(),
            });
            uploadedAny = true;
          }
        } catch (uploadError) {
          const current = queueRef.current.find((entry) => entry.id === item.id);
          if (current?.attempt === attempt) {
            updateQueueItem(item.id, {
              status: 'failed',
              error: uploadError instanceof Error ? uploadError.message : 'Upload failed',
            });
          }
        } finally {
          controllersRef.current.delete(item.id);
        }
      }
    } finally {
      processingRef.current = false;
      if (queueRef.current.some((item) => item.status === 'queued')) {
        void processQueue();
      } else if (uploadedAny) {
        onFilesUploaded();
      }
    }
  }

  function uploadFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setError(null);
    const now = Date.now();
    replaceQueue([
      ...queueRef.current,
      ...fileArray.map((file, index): QueueItem => ({
        id: `${now}-${index}-${crypto.randomUUID()}`,
        file,
        status: 'queued',
        bytes: 0,
        total: file.size,
        lastActivity: now,
        attempt: 0,
      })),
    ]);
    if (inputRef.current) inputRef.current.value = '';
    void processQueue();
  }

  function restartUpload(id: string): void {
    const item = queueRef.current.find((entry) => entry.id === id);
    if (!item) return;
    controllersRef.current.get(id)?.abort();
    updateQueueItem(id, {
      status: 'queued',
      bytes: 0,
      error: undefined,
      lastActivity: Date.now(),
      attempt: item.attempt + 1,
    });
    void processQueue();
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

  const totalQueueBytes = queue.reduce((sum, item) => sum + item.total, 0);
  const transferredQueueBytes = queue.reduce((sum, item) => {
    if (item.status === 'complete' || item.status === 'completing' || item.status === 'processing') {
      return sum + item.total;
    }
    if (item.status === 'uploading' || item.status === 'stalled') return sum + item.bytes;
    return sum;
  }, 0);
  const queuePercent = totalQueueBytes > 0
    ? Math.round((transferredQueueBytes / totalQueueBytes) * 100)
    : 0;
  const completedCount = queue.filter((item) => item.status === 'complete').length;

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
          <span>{queue.length > 0 ? 'Drop or choose more files' : 'Drop files here or click to upload'}</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleChange}
          />
        </div>
      )}

      {!readOnly && queue.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-white/10 bg-black/15" aria-label="Upload queue">
          <div className="border-b border-white/10 px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-zinc-300">
                {completedCount} of {queue.length} uploaded
              </span>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-zinc-500">{queuePercent}%</span>
                {completedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => replaceQueue(queueRef.current.filter((item) => item.status !== 'complete'))}
                    className="text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    Clear finished
                  </button>
                )}
              </div>
            </div>
            <div
              className="h-1 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-label="Total upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={queuePercent}
            >
              <div
                className="h-full rounded-full bg-indigo-500 transition-[width] duration-200"
                style={{ width: `${queuePercent}%` }}
              />
            </div>
          </div>
          <ul className="divide-y divide-white/5" aria-live="polite">
            {queue.map((item) => {
              const itemPercent = item.total > 0 ? Math.round((item.bytes / item.total) * 100) : 0;
              const canRestart = item.status === 'failed' || item.status === 'stalled';
              const progressWidth = item.status === 'complete' || item.status === 'completing' || item.status === 'processing'
                ? 100
                : itemPercent;

              return (
                <li key={item.id} className="relative px-3 py-2.5">
                  <div
                    className={`absolute inset-y-0 left-0 opacity-10 transition-[width] duration-200 ${
                      item.status === 'failed' || item.status === 'stalled' ? 'bg-amber-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${progressWidth}%` }}
                  />
                  <div className="relative flex items-center gap-2.5">
                    <FileIcon mimeType={item.file.type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm text-zinc-200" title={item.file.name}>{item.file.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-zinc-500">{formatSize(item.total)}</span>
                      </div>
                      <p className={`mt-0.5 truncate text-xs ${
                        item.status === 'failed' ? 'text-red-400' : item.status === 'stalled' ? 'text-amber-400' : 'text-zinc-500'
                      }`}>
                        {statusLabel(item)}
                      </p>
                    </div>
                    {canRestart && (
                      <button
                        type="button"
                        onClick={() => restartUpload(item.id)}
                        className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white"
                      >
                        Restart
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
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

import { createSHA256 } from 'hash-wasm';

export interface UploadProgress {
  phase: 'hashing' | 'uploading' | 'completing' | 'processing';
  bytes: number;
  total: number;
}

export interface UploadedFileResult {
  id: string;
  sha256: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  userAssetFileId: string;
}

interface CompletedPart {
  partNumber: number;
  etag: string;
}

interface InitiateResponse {
  multipartAvailable?: boolean;
  sessionId?: string;
  partSize?: number;
  totalParts?: number;
  completedParts?: CompletedPart[];
  message?: string;
}

const HASH_CHUNK_SIZE = 8 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 4;
const MAX_PART_RETRIES = 3;

export class MultipartUploadUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MultipartUploadUnavailableError';
  }
}

function uploadsBase(productId: string, versionId: string): string {
  return `/api/assets/${productId}/versions/${versionId}/files/uploads`;
}

export async function hashFile(
  file: File,
  onProgress?: (bytes: number, total: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const hasher = await createSHA256();
  let offset = 0;

  while (offset < file.size) {
    signal?.throwIfAborted();
    const chunk = file.slice(offset, offset + HASH_CHUNK_SIZE);
    const buffer = await chunk.arrayBuffer();
    signal?.throwIfAborted();
    hasher.update(new Uint8Array(buffer));
    offset += chunk.size;
    onProgress?.(offset, file.size);
  }

  return hasher.digest('hex');
}

async function uploadPartWithRetry(
  url: string,
  blob: Blob,
  partNumber: number,
  onProgress?: (bytes: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_PART_RETRIES; attempt++) {
    try {
      signal?.throwIfAborted();
      const uploadUrl = typeof window !== 'undefined' && new URL(url).origin !== window.location.origin
        ? `/api/uploads/proxy?url=${encodeURIComponent(url)}`
        : url;
      onProgress?.(0);
      return await uploadBlob(uploadUrl, blob, partNumber, onProgress, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
      await wait(500 * (attempt + 1), signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to upload part ${partNumber}`);
}

function uploadBlob(
  url: string,
  blob: Blob,
  partNumber: number,
  onProgress?: (bytes: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.upload.onprogress = (event) => onProgress?.(event.loaded);
    request.onerror = () => reject(new Error(`Part ${partNumber} upload failed`));
    request.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Part ${partNumber} upload failed with status ${request.status}`));
        return;
      }
      const etag = request.getResponseHeader('ETag') ?? request.getResponseHeader('etag');
      if (!etag) {
        reject(new Error(`Part ${partNumber} upload succeeded but no ETag was returned`));
        return;
      }
      onProgress?.(blob.size);
      resolve(etag.replace(/^"|"$/g, ''));
    };

    const abort = () => request.abort();
    signal?.addEventListener('abort', abort, { once: true });
    request.onloadend = () => signal?.removeEventListener('abort', abort);
    request.send(blob);
  });
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Upload aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function sessionStorageKey(productId: string, versionId: string, sha256: string): string {
  return `pdam-mpu:${productId}:${versionId}:${sha256}`;
}

export async function uploadFileViaMultipart(params: {
  file: File;
  productId: string;
  versionId: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}): Promise<UploadedFileResult> {
  const { file, productId, versionId, onProgress, signal } = params;
  const base = uploadsBase(productId, versionId);

  onProgress?.({ phase: 'hashing', bytes: 0, total: file.size });
  const sha256 = await hashFile(file, (bytes, total) => {
    onProgress?.({ phase: 'hashing', bytes, total });
  }, signal);

  const initiateResponse = await fetch(`${base}/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      sha256,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
    }),
  });

  if (initiateResponse.status === 501) {
    const data = await initiateResponse.json().catch(() => ({}));
    throw new MultipartUploadUnavailableError(
      (data as { message?: string }).message ?? 'Multipart upload is not available',
    );
  }

  if (!initiateResponse.ok) {
    const data = await initiateResponse.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Failed to initiate upload');
  }

  const initiate = await initiateResponse.json() as InitiateResponse;

  const sessionId = initiate.sessionId;
  const partSize = initiate.partSize;
  const totalParts = initiate.totalParts;

  if (!sessionId || !partSize || !totalParts) {
    throw new Error('Invalid initiate response');
  }
  const requiredPartSize = partSize;

  sessionStorage.setItem(sessionStorageKey(productId, versionId, sha256), sessionId);

  const completedParts = new Map<number, string>(
    (initiate.completedParts ?? []).map((part) => [part.partNumber, part.etag]),
  );

  const partsToUpload: number[] = [];
  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    if (!completedParts.has(partNumber)) {
      partsToUpload.push(partNumber);
    }
  }

  let uploadedBytes = Array.from(completedParts.keys()).reduce((sum, partNumber) => {
    const start = (partNumber - 1) * requiredPartSize;
    const end = Math.min(start + requiredPartSize, file.size);
    return sum + (end - start);
  }, 0);
  const activePartBytes = new Map<number, number>();

  function reportUploadProgress(): void {
    const activeBytes = Array.from(activePartBytes.values()).reduce((sum, bytes) => sum + bytes, 0);
    onProgress?.({
      phase: 'uploading',
      bytes: Math.min(uploadedBytes + activeBytes, file.size),
      total: file.size,
    });
  }

  reportUploadProgress();

  async function reportPart(partNumber: number, etag: string): Promise<void> {
    const response = await fetch(`${base}/${sessionId}/parts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ partNumber, etag }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? `Failed to record part ${partNumber}`);
    }
  }

  async function uploadPart(partNumber: number): Promise<void> {
    const start = (partNumber - 1) * requiredPartSize;
    const end = Math.min(start + requiredPartSize, file.size);
    const chunk = file.slice(start, end);

    const presignResponse = await fetch(`${base}/${sessionId}/parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ partNumbers: [partNumber] }),
    });

    if (!presignResponse.ok) {
      const data = await presignResponse.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? `Failed to presign part ${partNumber}`);
    }

    const presignData = await presignResponse.json() as { urls: { partNumber: number; url: string }[] };
    const url = presignData.urls[0]?.url;
    if (!url) {
      throw new Error(`Missing presigned URL for part ${partNumber}`);
    }

    const etag = await uploadPartWithRetry(url, chunk, partNumber, (bytes) => {
      activePartBytes.set(partNumber, bytes);
      reportUploadProgress();
    }, signal);
    completedParts.set(partNumber, etag);
    await reportPart(partNumber, etag);

    activePartBytes.delete(partNumber);
    uploadedBytes += chunk.size;
    reportUploadProgress();
  }

  const queue = [...partsToUpload];
  const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const partNumber = queue.shift();
      if (partNumber === undefined) return;
      await uploadPart(partNumber);
    }
  });

  await Promise.all(workers);

  onProgress?.({ phase: 'completing', bytes: file.size, total: file.size });

  const parts = Array.from(completedParts.entries())
    .map(([partNumber, etag]) => ({ partNumber, etag }))
    .sort((a, b) => a.partNumber - b.partNumber);

  const completeResponse = await fetch(`${base}/${sessionId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ parts }),
  });

  if (!completeResponse.ok) {
    const data = await completeResponse.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Failed to complete upload');
  }

  const completeData = await completeResponse.json() as { file?: UploadedFileResult };
  if (!completeData.file) {
    for (;;) {
      await wait(1000, signal);
      const statusResponse = await fetch(`${base}/${sessionId}`, { signal });
      if (!statusResponse.ok) throw new Error('Could not check upload processing status');
      const status = await statusResponse.json() as { status?: string; errorSummary?: string };
      if (status.status === 'completed') break;
      if (status.status === 'failed') throw new Error(status.errorSummary ?? 'Upload processing failed');
      onProgress?.({ phase: 'processing', bytes: file.size, total: file.size });
    }
  }
  sessionStorage.removeItem(sessionStorageKey(productId, versionId, sha256));
  // Staged multipart uploads are promoted asynchronously by the worker.
  // The caller only needs completion to be accepted, not a blob record yet.
  return completeData.file as UploadedFileResult;
}

export async function uploadFileLegacy(params: {
  file: File;
  productId: string;
  versionId: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}): Promise<void> {
  params.signal?.throwIfAborted();
  const form = new FormData();
  form.append('file', params.file);
  params.onProgress?.({ phase: 'uploading', bytes: 0, total: params.file.size });

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `/api/assets/${params.productId}/versions/${params.versionId}/files`);
    request.upload.onprogress = (event) => params.onProgress?.({
      phase: 'uploading',
      bytes: Math.min(event.loaded, params.file.size),
      total: params.file.size,
    });
    request.onerror = () => reject(new Error(`Failed to upload ${params.file.name}`));
    request.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      let data: { error?: string } = {};
      try {
        data = JSON.parse(request.responseText) as { error?: string };
      } catch {
        // Use the fallback error below when the response is not JSON.
      }
      reject(new Error(data.error ?? `Failed to upload ${params.file.name}`));
    };
    const abort = () => request.abort();
    params.signal?.addEventListener('abort', abort, { once: true });
    request.onloadend = () => params.signal?.removeEventListener('abort', abort);
    request.send(form);
  });
}

export async function uploadFile(params: {
  file: File;
  productId: string;
  versionId: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}): Promise<void> {
  try {
    await uploadFileViaMultipart(params);
  } catch (err) {
    if (err instanceof MultipartUploadUnavailableError) {
      await uploadFileLegacy(params);
      return;
    }
    throw err;
  }
}

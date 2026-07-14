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
): Promise<string> {
  const hasher = await createSHA256();
  let offset = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + HASH_CHUNK_SIZE);
    const buffer = await chunk.arrayBuffer();
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
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_PART_RETRIES; attempt++) {
    try {
      const uploadUrl = typeof window !== 'undefined' && new URL(url).origin !== window.location.origin
        ? `/api/uploads/proxy?url=${encodeURIComponent(url)}`
        : url;
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
      });

      if (!response.ok) {
        throw new Error(`Part ${partNumber} upload failed with status ${response.status}`);
      }

      const etag = response.headers.get('ETag') ?? response.headers.get('etag');
      if (!etag) {
        throw new Error(`Part ${partNumber} upload succeeded but no ETag was returned`);
      }

      return etag.replace(/^"|"$/g, '');
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to upload part ${partNumber}`);
}

function sessionStorageKey(productId: string, versionId: string, sha256: string): string {
  return `pdam-mpu:${productId}:${versionId}:${sha256}`;
}

export async function uploadFileViaMultipart(params: {
  file: File;
  productId: string;
  versionId: string;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<UploadedFileResult> {
  const { file, productId, versionId, onProgress } = params;
  const base = uploadsBase(productId, versionId);

  onProgress?.({ phase: 'hashing', bytes: 0, total: file.size });
  const sha256 = await hashFile(file, (bytes, total) => {
    onProgress?.({ phase: 'hashing', bytes, total });
  });

  const initiateResponse = await fetch(`${base}/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  onProgress?.({ phase: 'uploading', bytes: uploadedBytes, total: file.size });

  async function reportPart(partNumber: number, etag: string): Promise<void> {
    const response = await fetch(`${base}/${sessionId}/parts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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

    const etag = await uploadPartWithRetry(url, chunk, partNumber);
    completedParts.set(partNumber, etag);
    await reportPart(partNumber, etag);

    uploadedBytes += chunk.size;
    onProgress?.({ phase: 'uploading', bytes: uploadedBytes, total: file.size });
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
    body: JSON.stringify({ parts }),
  });

  if (!completeResponse.ok) {
    const data = await completeResponse.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Failed to complete upload');
  }

  const completeData = await completeResponse.json() as { file?: UploadedFileResult };
  if (!completeData.file) {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const statusResponse = await fetch(`${base}/${sessionId}`);
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
}): Promise<void> {
  const form = new FormData();
  form.append('file', params.file);

  const response = await fetch(
    `/api/assets/${params.productId}/versions/${params.versionId}/files`,
    { method: 'POST', body: form },
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Failed to upload ${params.file.name}`);
  }
}

export async function uploadFile(params: {
  file: File;
  productId: string;
  versionId: string;
  onProgress?: (progress: UploadProgress) => void;
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

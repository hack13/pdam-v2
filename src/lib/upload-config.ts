function getEnv(name: string): string | undefined {
  const runtimeEnv = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  const fromMeta = runtimeEnv?.[name];
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta;
  const fromProcess = process.env[name];
  if (typeof fromProcess === 'string' && fromProcess.length > 0) return fromProcess;
  return undefined;
}

const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024 * 1024; // 50 GB
const DEFAULT_PART_SIZE = 64 * 1024 * 1024; // 64 MB
const DEFAULT_PRESIGN_TTL_SECONDS = 3600;
const DEFAULT_SESSION_TTL_HOURS = 48;

/** S3 minimum part size (except the last part). */
export const MPU_MIN_PART_SIZE = 5 * 1024 * 1024;

export function getMaxUploadBytes(): number {
  const raw = getEnv('MAX_UPLOAD_BYTES');
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_UPLOAD_BYTES;
}

export function getMpuPartSize(): number {
  const raw = getEnv('MPU_PART_SIZE');
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= MPU_MIN_PART_SIZE) return parsed;
  }
  return DEFAULT_PART_SIZE;
}

export function getMpuPresignTtlSeconds(): number {
  const raw = getEnv('MPU_PRESIGN_TTL_SECONDS');
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PRESIGN_TTL_SECONDS;
}

export function getMpuSessionTtlHours(): number {
  const raw = getEnv('MPU_SESSION_TTL_HOURS');
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_SESSION_TTL_HOURS;
}

export function computePartCount(fileSize: number, partSize = getMpuPartSize()): number {
  return Math.max(1, Math.ceil(fileSize / partSize));
}

export function isValidSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

/** Files at or below this size use the legacy multipart POST upload. */
export const LEGACY_UPLOAD_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100 MB

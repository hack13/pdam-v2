/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DATABASE_URL?: string;
  readonly BETTER_AUTH_URL?: string;
  readonly BETTER_AUTH_SECRET?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly WEBHOOK_SECRET_ENCRYPTION_KEY?: string;
  readonly TRUST_PROXY?: 'true' | 'false';
  readonly S3_ENDPOINT?: string;
  readonly S3_REGION?: string;
  readonly S3_BUCKET?: string;
  readonly S3_ACCESS_KEY_ID?: string;
  readonly S3_SECRET_ACCESS_KEY?: string;
  readonly S3_FORCE_PATH_STYLE?: 'true' | 'false';
  readonly S3_PUBLIC_URL?: string;
  readonly UPLOADS_DIR?: string;
  readonly ADMIN_EMAILS?: string;
  readonly SYNC_WORKER_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

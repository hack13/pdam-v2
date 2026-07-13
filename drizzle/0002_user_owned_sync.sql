ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "root_path" text;
ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "credentials_encrypted" text;
ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "sync_mode" text NOT NULL DEFAULT 'snapshot';
ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "last_successful_sync_at" timestamp;
ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "last_attempted_sync_at" timestamp;
ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "last_error" text;
ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "error_count" integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "user_storage_connections_user_idx" ON "user_storage_connections" ("user_id");
CREATE INDEX IF NOT EXISTS "user_storage_connections_enabled_idx" ON "user_storage_connections" ("enabled");
CREATE TABLE IF NOT EXISTS "sync_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE, "token_prefix" text NOT NULL, "name" text NOT NULL,
  "scopes" text NOT NULL DEFAULT 'sync:manifest,sync:read,sync:export', "client_metadata" text,
  "expires_at" timestamp, "last_used_at" timestamp, "revoked_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "sync_tokens_user_idx" ON "sync_tokens" ("user_id");
CREATE TABLE IF NOT EXISTS "sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "connection_id" uuid NOT NULL REFERENCES "user_storage_connections"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE, "status" text NOT NULL DEFAULT 'queued',
  "files_discovered" integer NOT NULL DEFAULT 0, "files_uploaded" integer NOT NULL DEFAULT 0, "files_skipped" integer NOT NULL DEFAULT 0,
  "files_failed" integer NOT NULL DEFAULT 0, "bytes_uploaded" bigint NOT NULL DEFAULT 0, "manifest_id" text, "cursor" text,
  "error_summary" text, "started_at" timestamp, "completed_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "sync_runs_connection_idx" ON "sync_runs" ("connection_id");
CREATE INDEX IF NOT EXISTS "sync_runs_user_idx" ON "sync_runs" ("user_id");
CREATE TABLE IF NOT EXISTS "sync_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "run_id" uuid NOT NULL REFERENCES "sync_runs"("id") ON DELETE CASCADE,
  "connection_id" uuid NOT NULL REFERENCES "user_storage_connections"("id") ON DELETE CASCADE, "user_id" text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
  "blob_id" uuid NOT NULL REFERENCES "global_file_blobs"("id"), "destination_key" text NOT NULL, "content_hash" text NOT NULL,
  "byte_size" bigint NOT NULL, "status" text NOT NULL DEFAULT 'pending', "remote_id" text, "etag" text, "retry_count" integer NOT NULL DEFAULT 0,
  "last_error" text, "created_at" timestamp NOT NULL DEFAULT now(), UNIQUE ("connection_id", "blob_id", "content_hash")
);
CREATE INDEX IF NOT EXISTS "sync_items_run_idx" ON "sync_items" ("run_id");

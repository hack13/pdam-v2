ALTER TABLE "sync_items" ADD COLUMN IF NOT EXISTS "transfer_session_id" text;
ALTER TABLE "sync_items" ADD COLUMN IF NOT EXISTS "bytes_transferred" bigint NOT NULL DEFAULT 0;
ALTER TABLE "sync_items" ADD COLUMN IF NOT EXISTS "last_http_status" integer;
ALTER TABLE "sync_items" ADD COLUMN IF NOT EXISTS "last_attempted_at" timestamp;

ALTER TABLE "sync_runs" ADD COLUMN IF NOT EXISTS "failure_code" text;
ALTER TABLE "sync_runs" ADD COLUMN IF NOT EXISTS "failure_details" jsonb;

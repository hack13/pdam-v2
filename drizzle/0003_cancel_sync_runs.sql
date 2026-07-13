ALTER TABLE "sync_runs" ADD COLUMN IF NOT EXISTS "cancel_requested_at" timestamp;

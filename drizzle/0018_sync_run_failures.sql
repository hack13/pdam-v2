CREATE TABLE IF NOT EXISTS "sync_run_failures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "sync_runs"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
  "item_kind" text NOT NULL,
  "item_name" text NOT NULL,
  "destination_key" text NOT NULL,
  "error_message" text NOT NULL,
  "failure_code" text NOT NULL,
  "http_status" integer,
  "retryable" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'failed',
  "attempt_count" integer NOT NULL DEFAULT 1,
  "first_failed_at" timestamp NOT NULL DEFAULT now(),
  "last_failed_at" timestamp NOT NULL DEFAULT now(),
  "resolved_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "sync_run_failures_run_idx" ON "sync_run_failures" ("run_id");
CREATE INDEX IF NOT EXISTS "sync_run_failures_user_idx" ON "sync_run_failures" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "sync_run_failures_run_destination_idx" ON "sync_run_failures" ("run_id", "destination_key");

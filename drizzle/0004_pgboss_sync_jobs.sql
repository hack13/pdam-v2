ALTER TABLE "sync_runs" ADD COLUMN IF NOT EXISTS "pgboss_job_id" text;
ALTER TABLE "sync_runs" ADD COLUMN IF NOT EXISTS "pgboss_queue" text;
CREATE INDEX IF NOT EXISTS "sync_runs_pgboss_job_idx" ON "sync_runs" ("pgboss_job_id");

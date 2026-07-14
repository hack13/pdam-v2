ALTER TABLE "pending_uploads" ADD COLUMN IF NOT EXISTS "promotion_job_id" text;--> statement-breakpoint
ALTER TABLE "pending_uploads" ADD COLUMN IF NOT EXISTS "error_summary" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_uploads_promotion_job_idx" ON "pending_uploads" ("promotion_job_id");

CREATE TABLE IF NOT EXISTS "creator_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
  "creator_id" uuid REFERENCES "creators"("id") ON DELETE SET NULL,
  "requested_creator_name" text NOT NULL,
  "proof_urls" text[],
  "applicant_note" text,
  "status" text NOT NULL DEFAULT 'pending',
  "admin_note" text,
  "reviewed_by_user_id" text REFERENCES "auth_user"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_applications_user_idx" ON "creator_applications" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creator_applications_status_idx" ON "creator_applications" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creators_enrolled_by_user_uidx" ON "creators" ("enrolled_by_user_id") WHERE "enrolled_by_user_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "beta_invite" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL UNIQUE,
  "inviter_user_id" text REFERENCES "auth_user"("id") ON DELETE SET NULL,
  "available_at" timestamp NOT NULL,
  "accepted_by_user_id" text REFERENCES "auth_user"("id") ON DELETE SET NULL,
  "accepted_by_email" text,
  "accepted_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "beta_invite_inviter_available_idx" ON "beta_invite" ("inviter_user_id", "available_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "beta_invite_accepted_email_idx" ON "beta_invite" ("accepted_by_email");

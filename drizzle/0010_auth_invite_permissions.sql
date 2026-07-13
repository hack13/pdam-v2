ALTER TABLE "auth_user" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN IF NOT EXISTS "can_generate_invites" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN IF NOT EXISTS "invite_generation_limit" integer NOT NULL DEFAULT 0;--> statement-breakpoint

UPDATE "beta_invite"
SET "available_at" = now()
WHERE "accepted_at" IS NULL
  AND "revoked_at" IS NULL
  AND "available_at" > now();

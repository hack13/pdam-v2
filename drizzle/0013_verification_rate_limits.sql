CREATE TABLE IF NOT EXISTS "verification_rate_limits" (
  "user_id" text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "marketplace_source_id" uuid NOT NULL REFERENCES "marketplace_sources"("id") ON DELETE CASCADE,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_allowed_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "product_id", "marketplace_source_id")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "verification_ip_rate_limits" (
  "ip_hash" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamp NOT NULL DEFAULT now(),
  "request_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_ip_rate_limits_updated_idx" ON "verification_ip_rate_limits" ("updated_at");

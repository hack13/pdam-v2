ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "schedule_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "schedule_frequency" text;
ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "schedule_day_of_week" integer;
ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "schedule_time" text;
ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "schedule_timezone" text NOT NULL DEFAULT 'UTC';
ALTER TABLE "user_storage_connections" ADD COLUMN IF NOT EXISTS "last_scheduled_at" timestamp;

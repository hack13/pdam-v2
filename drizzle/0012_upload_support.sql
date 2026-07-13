CREATE TABLE IF NOT EXISTS "product_description_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "blob_id" uuid NOT NULL REFERENCES "global_file_blobs"("id"),
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "logical_size_bytes" bigint NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "pending_uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
  "product_version_id" uuid NOT NULL REFERENCES "product_versions"("id") ON DELETE CASCADE,
  "sha256" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size" bigint NOT NULL,
  "storage_key" text NOT NULL,
  "s3_upload_id" text NOT NULL,
  "completed_parts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL
);

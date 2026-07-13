ALTER TABLE "creators" ADD COLUMN IF NOT EXISTS "bio" text;
ALTER TABLE "creators" ADD COLUMN IF NOT EXISTS "profile_image_url" text;
ALTER TABLE "creators" ADD COLUMN IF NOT EXISTS "header_image_url" text;

CREATE TABLE IF NOT EXISTS "gallery_listing_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"media_type" text NOT NULL,
	"url" text NOT NULL,
	"storage_key" text,
	"alt_text" text,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gallery_listing_media_product_id_products_id_fk"
		FOREIGN KEY ("product_id") REFERENCES "public"."products"("id")
		ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "gallery_listing_media_product_idx"
	ON "gallery_listing_media" USING btree ("product_id");

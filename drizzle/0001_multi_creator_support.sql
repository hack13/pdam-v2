ALTER TABLE "products" ADD COLUMN "creator_ids" uuid[];--> statement-breakpoint
UPDATE "products" SET "creator_ids" = ARRAY["creator_id"] WHERE "creator_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "creator_id";

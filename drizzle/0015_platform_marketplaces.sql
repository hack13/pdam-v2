-- Built-in marketplaces are shared by every account. Keep this seed idempotent
-- so it also repairs existing installations that predate this migration.
INSERT INTO "marketplace_sources" ("name", "slug", "base_url", "is_user_defined")
SELECT "name", "slug", "base_url", false
FROM (
  VALUES
    ('Gumroad', 'gumroad', 'https://gumroad.com'),
    ('Jinxxy', 'jinxxy', 'https://jinxxy.com')
) AS platform_marketplaces("name", "slug", "base_url")
WHERE NOT EXISTS (
  SELECT 1
  FROM "marketplace_sources"
  WHERE "marketplace_sources"."slug" = platform_marketplaces."slug"
    AND "marketplace_sources"."is_user_defined" = false
);

-- Add public-facing fields for verification page
-- Run this against your Neon database

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "publicWhyChoose" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "publicSuggestedUse" TEXT;

-- Add comments for documentation
COMMENT ON COLUMN "Product"."publicWhyChoose" IS 'Why People Choose This - text displayed on verification page';
COMMENT ON COLUMN "Product"."publicSuggestedUse" IS 'Suggested Use - text displayed on verification page';

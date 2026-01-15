-- AlterEnum
-- Add ExperienceMode enum
DO $$ BEGIN
 CREATE TYPE "ExperienceMode" AS ENUM('MICRO', 'MACRO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AlterTable: Product
-- Add defaultExperienceMode with default MACRO
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "defaultExperienceMode" "ExperienceMode" NOT NULL DEFAULT 'MACRO';

-- AlterTable: PredictionProfile
-- Add experienceMode with default MACRO, then update existing rows
ALTER TABLE "PredictionProfile" ADD COLUMN IF NOT EXISTS "experienceMode" "ExperienceMode" NOT NULL DEFAULT 'MACRO';

-- Update existing PredictionProfile rows to MACRO (explicit, even though default handles it)
UPDATE "PredictionProfile" SET "experienceMode" = 'MACRO' WHERE "experienceMode" IS NULL;

-- AlterTable: ExperienceReview
-- Add experienceMode with default MACRO
ALTER TABLE "ExperienceReview" ADD COLUMN IF NOT EXISTS "experienceMode" "ExperienceMode" NOT NULL DEFAULT 'MACRO';

-- CreateIndex: PredictionProfile (productId, experienceMode)
CREATE INDEX IF NOT EXISTS "PredictionProfile_productId_experienceMode_idx" ON "PredictionProfile"("productId", "experienceMode");

-- CreateIndex: ExperienceReview (productId, experienceMode)
CREATE INDEX IF NOT EXISTS "ExperienceReview_productId_experienceMode_idx" ON "ExperienceReview"("productId", "experienceMode");


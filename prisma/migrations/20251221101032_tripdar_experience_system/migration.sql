-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ANALYST';

-- CreateTable
CREATE TABLE "PredictionProfile" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "transcend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "energize" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "create" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transform" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "connect" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vocabVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "PredictionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceReview" (
    "id" TEXT NOT NULL,
    "qrTokenId" TEXT,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "predictionProfileId" TEXT,
    "reviewSource" TEXT NOT NULL DEFAULT 'transparency_page',
    "overallMatch" INTEGER,
    "deltaTranscend" INTEGER,
    "deltaEnergize" INTEGER,
    "deltaCreate" INTEGER,
    "deltaTransform" INTEGER,
    "deltaConnect" INTEGER,
    "isFirstTime" BOOLEAN,
    "doseBandGrams" TEXT,
    "doseRelative" TEXT,
    "setting" TEXT,
    "note" VARCHAR(500),
    "deviceHash" TEXT NOT NULL,
    "geoCountry" TEXT,
    "geoRegion" TEXT,
    "integrityFlags" JSONB,
    "contentFlags" JSONB,
    "questionsAnswered" INTEGER NOT NULL DEFAULT 0,
    "questionsSkipped" INTEGER NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperienceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceScanLog" (
    "id" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "tokenId" TEXT,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PredictionProfile_productId_idx" ON "PredictionProfile"("productId");

-- CreateIndex
CREATE INDEX "PredictionProfile_createdAt_idx" ON "PredictionProfile"("createdAt");

-- CreateIndex
CREATE INDEX "ExperienceReview_productId_idx" ON "ExperienceReview"("productId");

-- CreateIndex
CREATE INDEX "ExperienceReview_batchId_idx" ON "ExperienceReview"("batchId");

-- CreateIndex
CREATE INDEX "ExperienceReview_deviceHash_idx" ON "ExperienceReview"("deviceHash");

-- CreateIndex
CREATE INDEX "ExperienceReview_createdAt_idx" ON "ExperienceReview"("createdAt");

-- CreateIndex
CREATE INDEX "ExperienceReview_overallMatch_idx" ON "ExperienceReview"("overallMatch");

-- CreateIndex
CREATE INDEX "DeviceScanLog_deviceHash_createdAt_idx" ON "DeviceScanLog"("deviceHash", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceScanLog_tokenId_createdAt_idx" ON "DeviceScanLog"("tokenId", "createdAt");

-- AddForeignKey
ALTER TABLE "PredictionProfile" ADD CONSTRAINT "PredictionProfile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionProfile" ADD CONSTRAINT "PredictionProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceReview" ADD CONSTRAINT "ExperienceReview_qrTokenId_fkey" FOREIGN KEY ("qrTokenId") REFERENCES "QRToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceReview" ADD CONSTRAINT "ExperienceReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceReview" ADD CONSTRAINT "ExperienceReview_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceReview" ADD CONSTRAINT "ExperienceReview_predictionProfileId_fkey" FOREIGN KEY ("predictionProfileId") REFERENCES "PredictionProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;


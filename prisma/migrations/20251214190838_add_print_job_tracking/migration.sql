-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "sheets" INTEGER NOT NULL,
    "paperMaterialId" TEXT,
    "paperUsedAt" DATETIME,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrintJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PrintJob_entityType_entityId_idx" ON "PrintJob"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "PrintJob_status_idx" ON "PrintJob"("status");

-- CreateIndex
CREATE INDEX "PrintJob_createdAt_idx" ON "PrintJob"("createdAt");

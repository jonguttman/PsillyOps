-- Phase 5.3: step assignment (ProductionRunStep.assignedToUserId)
-- Generated via `prisma migrate diff` from DB → schema

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductionRunStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionRunId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "skippedAt" DATETIME,
    "skipReason" TEXT,
    "performedById" TEXT,
    "assignedToUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionRunStep_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionRunStep_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductionRunStep_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProductionRunStep" ("completedAt", "createdAt", "id", "label", "order", "performedById", "productionRunId", "required", "skipReason", "skippedAt", "startedAt", "status", "templateKey") SELECT "completedAt", "createdAt", "id", "label", "order", "performedById", "productionRunId", "required", "skipReason", "skippedAt", "startedAt", "status", "templateKey" FROM "ProductionRunStep";
DROP TABLE "ProductionRunStep";
ALTER TABLE "new_ProductionRunStep" RENAME TO "ProductionRunStep";
CREATE INDEX "ProductionRunStep_productionRunId_order_idx" ON "ProductionRunStep"("productionRunId", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

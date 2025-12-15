-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RawMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "currentStockQty" REAL NOT NULL DEFAULT 0,
    "reorderPoint" REAL NOT NULL DEFAULT 0,
    "reorderQuantity" REAL NOT NULL DEFAULT 0,
    "moq" REAL NOT NULL DEFAULT 0,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "shelfLifeDays" INTEGER,
    "expiryWarningDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "preferredVendorId" TEXT,
    "strainId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RawMaterial_strainId_fkey" FOREIGN KEY ("strainId") REFERENCES "Strain" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RawMaterial_preferredVendorId_fkey" FOREIGN KEY ("preferredVendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RawMaterial" ("active", "category", "createdAt", "currentStockQty", "description", "expiryWarningDays", "id", "leadTimeDays", "moq", "name", "preferredVendorId", "reorderPoint", "reorderQuantity", "shelfLifeDays", "sku", "strainId", "unitOfMeasure", "updatedAt") SELECT "active", "category", "createdAt", "currentStockQty", "description", "expiryWarningDays", "id", "leadTimeDays", "moq", "name", "preferredVendorId", "reorderPoint", "reorderQuantity", "shelfLifeDays", "sku", "strainId", "unitOfMeasure", "updatedAt" FROM "RawMaterial";
DROP TABLE "RawMaterial";
ALTER TABLE "new_RawMaterial" RENAME TO "RawMaterial";
CREATE UNIQUE INDEX "RawMaterial_sku_key" ON "RawMaterial"("sku");
CREATE INDEX "RawMaterial_sku_idx" ON "RawMaterial"("sku");
CREATE INDEX "RawMaterial_active_idx" ON "RawMaterial"("active");
CREATE INDEX "RawMaterial_preferredVendorId_idx" ON "RawMaterial"("preferredVendorId");
CREATE INDEX "RawMaterial_category_idx" ON "RawMaterial"("category");
CREATE INDEX "RawMaterial_strainId_idx" ON "RawMaterial"("strainId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

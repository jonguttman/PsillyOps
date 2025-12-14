-- CreateTable
CREATE TABLE "ProductionStepTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionStepTemplate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "qrTokenId" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionRun_qrTokenId_fkey" FOREIGN KEY ("qrTokenId") REFERENCES "QRToken" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductionRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionRunStep" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionRunStep_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionRunStep_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProductionStepTemplate_productId_order_idx" ON "ProductionStepTemplate"("productId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionStepTemplate_productId_key_key" ON "ProductionStepTemplate"("productId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRun_qrTokenId_key" ON "ProductionRun"("qrTokenId");

-- CreateIndex
CREATE INDEX "ProductionRun_productId_idx" ON "ProductionRun"("productId");

-- CreateIndex
CREATE INDEX "ProductionRunStep_productionRunId_order_idx" ON "ProductionRunStep"("productionRunId", "order");

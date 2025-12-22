-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."ActivityEntity" AS ENUM ('PRODUCT', 'MATERIAL', 'BATCH', 'ORDER', 'PRODUCTION_ORDER', 'PRODUCTION_RUN', 'PURCHASE_ORDER', 'VENDOR', 'INVENTORY', 'WORK_CENTER', 'INVOICE', 'LABEL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."BatchStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'QC_HOLD', 'RELEASED', 'EXHAUSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."InventoryAdjustmentType" AS ENUM ('PRODUCTION_COMPLETE', 'PRODUCTION_SCRAP', 'MANUAL_CORRECTION', 'RECEIVING', 'CONSUMPTION');

-- CreateEnum
CREATE TYPE "public"."InventoryStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'QUARANTINED', 'DAMAGED', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "public"."InventoryType" AS ENUM ('PRODUCT', 'MATERIAL');

-- CreateEnum
CREATE TYPE "public"."LabelEntityType" AS ENUM ('PRODUCT', 'BATCH', 'INVENTORY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."MovementType" AS ENUM ('ADJUST', 'MOVE', 'CONSUME', 'PRODUCE', 'RECEIVE', 'RETURN', 'RESERVE', 'RELEASE');

-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'IN_FULFILLMENT', 'SHIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."PrintJobStatus" AS ENUM ('CREATED', 'PAPER_USED', 'VOIDED');

-- CreateEnum
CREATE TYPE "public"."ProductionRunStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ProductionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ProductionStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "public"."PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."QCStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'HOLD', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."QRTokenStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."TransparencyResult" AS ENUM ('PASS', 'PENDING', 'FAIL');

-- CreateEnum
CREATE TYPE "public"."UnitOfMeasure" AS ENUM ('GRAM', 'KILOGRAM', 'MILLILITER', 'LITER', 'UNIT', 'EACH', 'PACK', 'BOX');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP');

-- CreateTable
CREATE TABLE "public"."AICommandLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "inputText" TEXT NOT NULL,
    "normalized" TEXT,
    "status" TEXT NOT NULL,
    "aiResult" JSONB,
    "executedPayload" JSONB,
    "correctedCommand" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "AICommandLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AIDocumentImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sourceType" TEXT NOT NULL,
    "originalName" TEXT,
    "contentType" TEXT,
    "textPreview" TEXT,
    "status" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "aiResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "AIDocumentImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActivityLog" (
    "id" TEXT NOT NULL,
    "entityType" "public"."ActivityEntity",
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "summary" TEXT NOT NULL,
    "diff" JSONB,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "userAgent" TEXT,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BOMItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantityPerUnit" DOUBLE PRECISION NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BOMItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Batch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "plannedQuantity" INTEGER NOT NULL,
    "actualQuantity" INTEGER,
    "status" "public"."BatchStatus" NOT NULL DEFAULT 'PLANNED',
    "productionOrderId" TEXT,
    "productionDate" TIMESTAMP(3),
    "manufactureDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "expectedYield" DOUBLE PRECISION,
    "actualYield" DOUBLE PRECISION,
    "lossQty" DOUBLE PRECISION,
    "lossReason" TEXT,
    "qcStatus" "public"."QCStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BatchMaker" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchMaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "deltaQty" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "adjustmentType" "public"."InventoryAdjustmentType" NOT NULL,
    "relatedEntityType" "public"."ActivityEntity",
    "relatedEntityId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InventoryItem" (
    "id" TEXT NOT NULL,
    "type" "public"."InventoryType" NOT NULL,
    "productId" TEXT,
    "materialId" TEXT,
    "batchId" TEXT,
    "locationId" TEXT NOT NULL,
    "quantityOnHand" DOUBLE PRECISION NOT NULL,
    "quantityReserved" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitOfMeasure" TEXT NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "externalRef" TEXT,
    "status" "public"."InventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "lotNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InventoryMovement" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT,
    "materialId" TEXT,
    "productId" TEXT,
    "batchId" TEXT,
    "type" "public"."MovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "reason" TEXT,
    "reference" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Lab" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LabelTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" "public"."LabelEntityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LabelTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "qrTemplate" TEXT,
    "labelWidthIn" DOUBLE PRECISION,
    "labelHeightIn" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "elements" JSONB,

    CONSTRAINT "LabelTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LaborEntry" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "role" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isDefaultReceiving" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultShipping" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaterialAttachment" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaterialCostHistory" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "vendorId" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialCostHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaterialVendor" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "leadTimeDays" INTEGER,
    "lastPrice" DOUBLE PRECISION,
    "moq" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrderLineItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityOrdered" INTEGER NOT NULL,
    "quantityAllocated" INTEGER NOT NULL DEFAULT 0,
    "shortageQuantity" INTEGER NOT NULL DEFAULT 0,
    "allocationDetails" JSONB,
    "unitWholesalePrice" DOUBLE PRECISION,
    "lineTotal" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PrintJob" (
    "id" TEXT NOT NULL,
    "status" "public"."PrintJobStatus" NOT NULL DEFAULT 'CREATED',
    "sheets" INTEGER NOT NULL,
    "paperMaterialId" TEXT,
    "paperUsedAt" TIMESTAMP(3),
    "entityType" "public"."LabelEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "defaultBatchSize" INTEGER,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "wholesalePrice" DOUBLE PRECISION,
    "strainId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "barcodeValue" TEXT,
    "labelHeightIn" DOUBLE PRECISION,
    "labelPrintQuantity" INTEGER,
    "labelWidthIn" DOUBLE PRECISION,
    "sheetMarginTopBottomIn" DOUBLE PRECISION,
    "upc" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductionOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityToMake" INTEGER NOT NULL,
    "batchSize" DOUBLE PRECISION,
    "status" "public"."ProductionStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduledDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "workCenterId" TEXT,
    "templateId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "linkedRetailerOrderIds" JSONB,
    "materialRequirements" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductionOrderMaterial" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "requiredQty" DOUBLE PRECISION NOT NULL,
    "issuedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shortage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrderMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductionRun" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "public"."ProductionRunStatus" NOT NULL DEFAULT 'PLANNED',
    "qrTokenId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductionRunStep" (
    "id" TEXT NOT NULL,
    "productionRunId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL,
    "status" "public"."ProductionStepStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "performedById" TEXT,
    "assignedToUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductionStepTemplate" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionStepTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "defaultBatchSize" DOUBLE PRECISION NOT NULL,
    "instructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "public"."PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "expectedDeliveryDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PurchaseOrderLineItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantityOrdered" DOUBLE PRECISION NOT NULL,
    "quantityReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION,
    "lotNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QRRedirectRule" (
    "id" TEXT NOT NULL,
    "entityType" "public"."LabelEntityType",
    "entityId" TEXT,
    "versionId" TEXT,
    "redirectUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QRRedirectRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QRToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "public"."QRTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "entityType" "public"."LabelEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "versionId" TEXT,
    "redirectUrl" TEXT,
    "printedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "lastScannedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,

    CONSTRAINT "QRToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RawMaterial" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "currentStockQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorderPoint" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorderQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moq" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "shelfLifeDays" INTEGER,
    "expiryWarningDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "preferredVendorId" TEXT,
    "strainId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "upc" TEXT,

    CONSTRAINT "RawMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Retailer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "shippingAddress" TEXT,
    "billingAddress" TEXT,
    "notes" TEXT,
    "salesRepId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Retailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedShipDate" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "trackingNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Strain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Strain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TransparencyRecord" (
    "id" TEXT NOT NULL,
    "entityType" "public"."ActivityEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "productionDate" TIMESTAMP(3) NOT NULL,
    "batchCode" TEXT,
    "labId" TEXT,
    "labNameSnapshot" TEXT NOT NULL,
    "testDate" TIMESTAMP(3),
    "testResult" "public"."TransparencyResult",
    "rawMaterialLinked" BOOLEAN NOT NULL DEFAULT true,
    "publicDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransparencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UnitConversion" (
    "id" TEXT NOT NULL,
    "fromUnit" "public"."UnitOfMeasure" NOT NULL,
    "toUnit" "public"."UnitOfMeasure" NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "UnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'REP',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "passwordSetAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "paymentTerms" TEXT,
    "defaultLeadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkCenter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AICommandLog_createdAt_idx" ON "public"."AICommandLog"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "AICommandLog_status_idx" ON "public"."AICommandLog"("status" ASC);

-- CreateIndex
CREATE INDEX "AIDocumentImport_createdAt_idx" ON "public"."AIDocumentImport"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "AIDocumentImport_status_idx" ON "public"."AIDocumentImport"("status" ASC);

-- CreateIndex
CREATE INDEX "ActivityLog_action_idx" ON "public"."ActivityLog"("action" ASC);

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "public"."ActivityLog"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "public"."ActivityLog"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "ActivityLog_tags_idx" ON "public"."ActivityLog"("tags" ASC);

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "public"."ActivityLog"("userId" ASC);

-- CreateIndex
CREATE INDEX "BOMItem_materialId_idx" ON "public"."BOMItem"("materialId" ASC);

-- CreateIndex
CREATE INDEX "BOMItem_productId_idx" ON "public"."BOMItem"("productId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "BOMItem_productId_materialId_version_key" ON "public"."BOMItem"("productId" ASC, "materialId" ASC, "version" ASC);

-- CreateIndex
CREATE INDEX "Batch_batchCode_idx" ON "public"."Batch"("batchCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Batch_batchCode_key" ON "public"."Batch"("batchCode" ASC);

-- CreateIndex
CREATE INDEX "Batch_productId_idx" ON "public"."Batch"("productId" ASC);

-- CreateIndex
CREATE INDEX "Batch_productionOrderId_idx" ON "public"."Batch"("productionOrderId" ASC);

-- CreateIndex
CREATE INDEX "Batch_qcStatus_idx" ON "public"."Batch"("qcStatus" ASC);

-- CreateIndex
CREATE INDEX "Batch_status_idx" ON "public"."Batch"("status" ASC);

-- CreateIndex
CREATE INDEX "BatchMaker_batchId_idx" ON "public"."BatchMaker"("batchId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "BatchMaker_batchId_userId_key" ON "public"."BatchMaker"("batchId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "BatchMaker_userId_idx" ON "public"."BatchMaker"("userId" ASC);

-- CreateIndex
CREATE INDEX "InventoryAdjustment_createdAt_idx" ON "public"."InventoryAdjustment"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "InventoryAdjustment_inventoryId_idx" ON "public"."InventoryAdjustment"("inventoryId" ASC);

-- CreateIndex
CREATE INDEX "InventoryItem_batchId_idx" ON "public"."InventoryItem"("batchId" ASC);

-- CreateIndex
CREATE INDEX "InventoryItem_expiryDate_idx" ON "public"."InventoryItem"("expiryDate" ASC);

-- CreateIndex
CREATE INDEX "InventoryItem_locationId_idx" ON "public"."InventoryItem"("locationId" ASC);

-- CreateIndex
CREATE INDEX "InventoryItem_materialId_idx" ON "public"."InventoryItem"("materialId" ASC);

-- CreateIndex
CREATE INDEX "InventoryItem_productId_idx" ON "public"."InventoryItem"("productId" ASC);

-- CreateIndex
CREATE INDEX "InventoryItem_status_idx" ON "public"."InventoryItem"("status" ASC);

-- CreateIndex
CREATE INDEX "InventoryItem_type_idx" ON "public"."InventoryItem"("type" ASC);

-- CreateIndex
CREATE INDEX "InventoryMovement_batchId_idx" ON "public"."InventoryMovement"("batchId" ASC);

-- CreateIndex
CREATE INDEX "InventoryMovement_createdAt_idx" ON "public"."InventoryMovement"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "InventoryMovement_inventoryId_idx" ON "public"."InventoryMovement"("inventoryId" ASC);

-- CreateIndex
CREATE INDEX "InventoryMovement_materialId_idx" ON "public"."InventoryMovement"("materialId" ASC);

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_idx" ON "public"."InventoryMovement"("productId" ASC);

-- CreateIndex
CREATE INDEX "InventoryMovement_type_idx" ON "public"."InventoryMovement"("type" ASC);

-- CreateIndex
CREATE INDEX "Invoice_invoiceNo_idx" ON "public"."Invoice"("invoiceNo" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "public"."Invoice"("invoiceNo" ASC);

-- CreateIndex
CREATE INDEX "Invoice_issuedAt_idx" ON "public"."Invoice"("issuedAt" ASC);

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "public"."Invoice"("orderId" ASC);

-- CreateIndex
CREATE INDEX "Invoice_retailerId_idx" ON "public"."Invoice"("retailerId" ASC);

-- CreateIndex
CREATE INDEX "LabelTemplate_entityType_idx" ON "public"."LabelTemplate"("entityType" ASC);

-- CreateIndex
CREATE INDEX "LabelTemplateVersion_isActive_idx" ON "public"."LabelTemplateVersion"("isActive" ASC);

-- CreateIndex
CREATE INDEX "LabelTemplateVersion_templateId_idx" ON "public"."LabelTemplateVersion"("templateId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "LabelTemplateVersion_templateId_version_key" ON "public"."LabelTemplateVersion"("templateId" ASC, "version" ASC);

-- CreateIndex
CREATE INDEX "LaborEntry_batchId_idx" ON "public"."LaborEntry"("batchId" ASC);

-- CreateIndex
CREATE INDEX "LaborEntry_createdAt_idx" ON "public"."LaborEntry"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "LaborEntry_userId_idx" ON "public"."LaborEntry"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "public"."Location"("name" ASC);

-- CreateIndex
CREATE INDEX "Location_type_idx" ON "public"."Location"("type" ASC);

-- CreateIndex
CREATE INDEX "MaterialAttachment_fileType_idx" ON "public"."MaterialAttachment"("fileType" ASC);

-- CreateIndex
CREATE INDEX "MaterialAttachment_materialId_idx" ON "public"."MaterialAttachment"("materialId" ASC);

-- CreateIndex
CREATE INDEX "MaterialCostHistory_createdAt_idx" ON "public"."MaterialCostHistory"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "MaterialCostHistory_materialId_idx" ON "public"."MaterialCostHistory"("materialId" ASC);

-- CreateIndex
CREATE INDEX "MaterialCostHistory_vendorId_idx" ON "public"."MaterialCostHistory"("vendorId" ASC);

-- CreateIndex
CREATE INDEX "MaterialVendor_materialId_idx" ON "public"."MaterialVendor"("materialId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialVendor_materialId_vendorId_key" ON "public"."MaterialVendor"("materialId" ASC, "vendorId" ASC);

-- CreateIndex
CREATE INDEX "MaterialVendor_preferred_idx" ON "public"."MaterialVendor"("preferred" ASC);

-- CreateIndex
CREATE INDEX "MaterialVendor_vendorId_idx" ON "public"."MaterialVendor"("vendorId" ASC);

-- CreateIndex
CREATE INDEX "OrderLineItem_orderId_idx" ON "public"."OrderLineItem"("orderId" ASC);

-- CreateIndex
CREATE INDEX "OrderLineItem_productId_idx" ON "public"."OrderLineItem"("productId" ASC);

-- CreateIndex
CREATE INDEX "PrintJob_createdAt_idx" ON "public"."PrintJob"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "PrintJob_entityType_entityId_idx" ON "public"."PrintJob"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "PrintJob_status_idx" ON "public"."PrintJob"("status" ASC);

-- CreateIndex
CREATE INDEX "Product_active_idx" ON "public"."Product"("active" ASC);

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "public"."Product"("sku" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "public"."Product"("sku" ASC);

-- CreateIndex
CREATE INDEX "Product_strainId_idx" ON "public"."Product"("strainId" ASC);

-- CreateIndex
CREATE INDEX "Product_upc_idx" ON "public"."Product"("upc" ASC);

-- CreateIndex
CREATE INDEX "ProductionOrder_createdByUserId_idx" ON "public"."ProductionOrder"("createdByUserId" ASC);

-- CreateIndex
CREATE INDEX "ProductionOrder_orderNumber_idx" ON "public"."ProductionOrder"("orderNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_orderNumber_key" ON "public"."ProductionOrder"("orderNumber" ASC);

-- CreateIndex
CREATE INDEX "ProductionOrder_productId_idx" ON "public"."ProductionOrder"("productId" ASC);

-- CreateIndex
CREATE INDEX "ProductionOrder_scheduledDate_idx" ON "public"."ProductionOrder"("scheduledDate" ASC);

-- CreateIndex
CREATE INDEX "ProductionOrder_status_idx" ON "public"."ProductionOrder"("status" ASC);

-- CreateIndex
CREATE INDEX "ProductionOrder_workCenterId_idx" ON "public"."ProductionOrder"("workCenterId" ASC);

-- CreateIndex
CREATE INDEX "ProductionOrderMaterial_materialId_idx" ON "public"."ProductionOrderMaterial"("materialId" ASC);

-- CreateIndex
CREATE INDEX "ProductionOrderMaterial_productionOrderId_idx" ON "public"."ProductionOrderMaterial"("productionOrderId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrderMaterial_productionOrderId_materialId_key" ON "public"."ProductionOrderMaterial"("productionOrderId" ASC, "materialId" ASC);

-- CreateIndex
CREATE INDEX "ProductionRun_productId_idx" ON "public"."ProductionRun"("productId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRun_qrTokenId_key" ON "public"."ProductionRun"("qrTokenId" ASC);

-- CreateIndex
CREATE INDEX "ProductionRunStep_productionRunId_order_idx" ON "public"."ProductionRunStep"("productionRunId" ASC, "order" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionStepTemplate_productId_key_key" ON "public"."ProductionStepTemplate"("productId" ASC, "key" ASC);

-- CreateIndex
CREATE INDEX "ProductionStepTemplate_productId_order_idx" ON "public"."ProductionStepTemplate"("productId" ASC, "order" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionStepTemplate_productId_order_key" ON "public"."ProductionStepTemplate"("productId" ASC, "order" ASC);

-- CreateIndex
CREATE INDEX "ProductionTemplate_active_idx" ON "public"."ProductionTemplate"("active" ASC);

-- CreateIndex
CREATE INDEX "ProductionTemplate_productId_idx" ON "public"."ProductionTemplate"("productId" ASC);

-- CreateIndex
CREATE INDEX "PurchaseOrder_createdByUserId_idx" ON "public"."PurchaseOrder"("createdByUserId" ASC);

-- CreateIndex
CREATE INDEX "PurchaseOrder_poNumber_idx" ON "public"."PurchaseOrder"("poNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "public"."PurchaseOrder"("poNumber" ASC);

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "public"."PurchaseOrder"("status" ASC);

-- CreateIndex
CREATE INDEX "PurchaseOrder_vendorId_idx" ON "public"."PurchaseOrder"("vendorId" ASC);

-- CreateIndex
CREATE INDEX "PurchaseOrderLineItem_materialId_idx" ON "public"."PurchaseOrderLineItem"("materialId" ASC);

-- CreateIndex
CREATE INDEX "PurchaseOrderLineItem_purchaseOrderId_idx" ON "public"."PurchaseOrderLineItem"("purchaseOrderId" ASC);

-- CreateIndex
CREATE INDEX "QRRedirectRule_active_idx" ON "public"."QRRedirectRule"("active" ASC);

-- CreateIndex
CREATE INDEX "QRRedirectRule_entityType_entityId_idx" ON "public"."QRRedirectRule"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "QRRedirectRule_isFallback_idx" ON "public"."QRRedirectRule"("isFallback" ASC);

-- CreateIndex
CREATE INDEX "QRRedirectRule_versionId_idx" ON "public"."QRRedirectRule"("versionId" ASC);

-- CreateIndex
CREATE INDEX "QRToken_entityType_entityId_idx" ON "public"."QRToken"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "QRToken_printedAt_idx" ON "public"."QRToken"("printedAt" ASC);

-- CreateIndex
CREATE INDEX "QRToken_status_idx" ON "public"."QRToken"("status" ASC);

-- CreateIndex
CREATE INDEX "QRToken_token_idx" ON "public"."QRToken"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "QRToken_token_key" ON "public"."QRToken"("token" ASC);

-- CreateIndex
CREATE INDEX "QRToken_versionId_idx" ON "public"."QRToken"("versionId" ASC);

-- CreateIndex
CREATE INDEX "RawMaterial_active_idx" ON "public"."RawMaterial"("active" ASC);

-- CreateIndex
CREATE INDEX "RawMaterial_category_idx" ON "public"."RawMaterial"("category" ASC);

-- CreateIndex
CREATE INDEX "RawMaterial_preferredVendorId_idx" ON "public"."RawMaterial"("preferredVendorId" ASC);

-- CreateIndex
CREATE INDEX "RawMaterial_sku_idx" ON "public"."RawMaterial"("sku" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterial_sku_key" ON "public"."RawMaterial"("sku" ASC);

-- CreateIndex
CREATE INDEX "RawMaterial_strainId_idx" ON "public"."RawMaterial"("strainId" ASC);

-- CreateIndex
CREATE INDEX "RawMaterial_upc_idx" ON "public"."RawMaterial"("upc" ASC);

-- CreateIndex
CREATE INDEX "Retailer_name_idx" ON "public"."Retailer"("name" ASC);

-- CreateIndex
CREATE INDEX "Retailer_salesRepId_idx" ON "public"."Retailer"("salesRepId" ASC);

-- CreateIndex
CREATE INDEX "RetailerOrder_createdByUserId_idx" ON "public"."RetailerOrder"("createdByUserId" ASC);

-- CreateIndex
CREATE INDEX "RetailerOrder_orderNumber_idx" ON "public"."RetailerOrder"("orderNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RetailerOrder_orderNumber_key" ON "public"."RetailerOrder"("orderNumber" ASC);

-- CreateIndex
CREATE INDEX "RetailerOrder_retailerId_idx" ON "public"."RetailerOrder"("retailerId" ASC);

-- CreateIndex
CREATE INDEX "RetailerOrder_status_idx" ON "public"."RetailerOrder"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Strain_name_key" ON "public"."Strain"("name" ASC);

-- CreateIndex
CREATE INDEX "Strain_shortCode_idx" ON "public"."Strain"("shortCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Strain_shortCode_key" ON "public"."Strain"("shortCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "public"."SystemConfig"("key" ASC);

-- CreateIndex
CREATE INDEX "TransparencyRecord_entityType_entityId_testDate_idx" ON "public"."TransparencyRecord"("entityType" ASC, "entityId" ASC, "testDate" ASC);

-- CreateIndex
CREATE INDEX "TransparencyRecord_labId_idx" ON "public"."TransparencyRecord"("labId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UnitConversion_fromUnit_toUnit_key" ON "public"."UnitConversion"("fromUnit" ASC, "toUnit" ASC);

-- CreateIndex
CREATE INDEX "User_email_idx" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE INDEX "User_role_idx" ON "public"."User"("role" ASC);

-- CreateIndex
CREATE INDEX "Vendor_active_idx" ON "public"."Vendor"("active" ASC);

-- CreateIndex
CREATE INDEX "Vendor_name_idx" ON "public"."Vendor"("name" ASC);

-- CreateIndex
CREATE INDEX "WorkCenter_active_idx" ON "public"."WorkCenter"("active" ASC);

-- AddForeignKey
ALTER TABLE "public"."AICommandLog" ADD CONSTRAINT "AICommandLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AIDocumentImport" ADD CONSTRAINT "AIDocumentImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BOMItem" ADD CONSTRAINT "BOMItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BOMItem" ADD CONSTRAINT "BOMItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Batch" ADD CONSTRAINT "Batch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Batch" ADD CONSTRAINT "Batch_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "public"."ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BatchMaker" ADD CONSTRAINT "BatchMaker_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BatchMaker" ADD CONSTRAINT "BatchMaker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "public"."InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryItem" ADD CONSTRAINT "InventoryItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryItem" ADD CONSTRAINT "InventoryItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryItem" ADD CONSTRAINT "InventoryItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryItem" ADD CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."RetailerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "public"."Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LabelTemplateVersion" ADD CONSTRAINT "LabelTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."LabelTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LaborEntry" ADD CONSTRAINT "LaborEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LaborEntry" ADD CONSTRAINT "LaborEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaterialAttachment" ADD CONSTRAINT "MaterialAttachment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaterialCostHistory" ADD CONSTRAINT "MaterialCostHistory_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaterialCostHistory" ADD CONSTRAINT "MaterialCostHistory_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaterialVendor" ADD CONSTRAINT "MaterialVendor_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaterialVendor" ADD CONSTRAINT "MaterialVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderLineItem" ADD CONSTRAINT "OrderLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."RetailerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderLineItem" ADD CONSTRAINT "OrderLineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PrintJob" ADD CONSTRAINT "PrintJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_strainId_fkey" FOREIGN KEY ("strainId") REFERENCES "public"."Strain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionOrder" ADD CONSTRAINT "ProductionOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionOrder" ADD CONSTRAINT "ProductionOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionOrder" ADD CONSTRAINT "ProductionOrder_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."ProductionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionOrder" ADD CONSTRAINT "ProductionOrder_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "public"."WorkCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionOrderMaterial" ADD CONSTRAINT "ProductionOrderMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionOrderMaterial" ADD CONSTRAINT "ProductionOrderMaterial_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "public"."ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionRun" ADD CONSTRAINT "ProductionRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionRun" ADD CONSTRAINT "ProductionRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionRun" ADD CONSTRAINT "ProductionRun_qrTokenId_fkey" FOREIGN KEY ("qrTokenId") REFERENCES "public"."QRToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionRunStep" ADD CONSTRAINT "ProductionRunStep_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionRunStep" ADD CONSTRAINT "ProductionRunStep_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionRunStep" ADD CONSTRAINT "ProductionRunStep_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "public"."ProductionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionStepTemplate" ADD CONSTRAINT "ProductionStepTemplate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionTemplate" ADD CONSTRAINT "ProductionTemplate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseOrderLineItem" ADD CONSTRAINT "PurchaseOrderLineItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseOrderLineItem" ADD CONSTRAINT "PurchaseOrderLineItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QRRedirectRule" ADD CONSTRAINT "QRRedirectRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QRToken" ADD CONSTRAINT "QRToken_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QRToken" ADD CONSTRAINT "QRToken_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."LabelTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterial" ADD CONSTRAINT "RawMaterial_preferredVendorId_fkey" FOREIGN KEY ("preferredVendorId") REFERENCES "public"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterial" ADD CONSTRAINT "RawMaterial_strainId_fkey" FOREIGN KEY ("strainId") REFERENCES "public"."Strain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Retailer" ADD CONSTRAINT "Retailer_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerOrder" ADD CONSTRAINT "RetailerOrder_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerOrder" ADD CONSTRAINT "RetailerOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerOrder" ADD CONSTRAINT "RetailerOrder_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "public"."Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransparencyRecord" ADD CONSTRAINT "TransparencyRecord_labId_fkey" FOREIGN KEY ("labId") REFERENCES "public"."Lab"("id") ON DELETE SET NULL ON UPDATE CASCADE;


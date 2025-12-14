-- Phase 5.2 pre-req: ensure per-product template order uniqueness
-- Generated via `prisma migrate diff` from DB → schema

-- CreateIndex
CREATE UNIQUE INDEX "ProductionStepTemplate_productId_order_key" ON "ProductionStepTemplate"("productId", "order");

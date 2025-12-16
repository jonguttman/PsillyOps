import { PrismaClient } from "@prisma/client";
import Database from "better-sqlite3";
import path from "path";

// Direct SQLite connection
const sqliteDb = new Database(path.join(process.cwd(), "prisma/dev.db"), { readonly: true });

// Postgres client (uses DATABASE_URL from env)
const postgres = new PrismaClient();

// Helper to safely parse dates
function parseDate(dateValue: any): Date {
  if (!dateValue) return new Date();
  const parsed = new Date(dateValue);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

// Helper to convert SQLite boolean (0/1) to JS boolean
function toBool(value: any): boolean {
  return value === 1 || value === true;
}

async function migrate<T>(
  name: string,
  query: string,
  upsert: (row: T) => Promise<any>
) {
  const rows = sqliteDb.prepare(query).all() as T[];
  
  for (const row of rows) {
    await upsert(row);
  }
  
  console.log(`Migrated ${rows.length} ${name}`);
}

async function main() {
  console.log("Starting SQLite → Postgres migration");

  // Migrate Strains
  await migrate(
    "strains",
    "SELECT * FROM Strain",
    (row: any) =>
      postgres.strain.upsert({
        where: { id: row.id },
        update: {},
        create: {
          id: row.id,
          name: row.name,
          shortCode: row.shortCode,
          aliases: row.aliases || "[]",
          active: toBool(row.active),
          createdAt: parseDate(row.createdAt)
        }
      })
  );

  // Migrate Vendors
  await migrate(
    "vendors",
    "SELECT * FROM Vendor",
    (row: any) =>
      postgres.vendor.upsert({
        where: { id: row.id },
        update: {},
        create: {
          id: row.id,
          name: row.name,
          contactName: row.contactName || null,
          contactEmail: row.contactEmail || null,
          contactPhone: row.contactPhone || null,
          address: row.address || null,
          notes: row.notes || null,
          createdAt: parseDate(row.createdAt),
          updatedAt: parseDate(row.updatedAt)
        }
      })
  );

  // Migrate RawMaterials
  await migrate(
    "materials",
    "SELECT * FROM RawMaterial",
    (row: any) =>
      postgres.rawMaterial.upsert({
        where: { id: row.id },
        update: {},
        create: {
          id: row.id,
          name: row.name,
          sku: row.sku,
          unitOfMeasure: row.unitOfMeasure,
          category: row.category,
          description: row.description || null,
          currentStockQty: row.currentStockQty,
          reorderPoint: row.reorderPoint,
          reorderQuantity: row.reorderQuantity,
          moq: row.moq,
          leadTimeDays: row.leadTimeDays,
          shelfLifeDays: row.shelfLifeDays || null,
          expiryWarningDays: row.expiryWarningDays || null,
          active: toBool(row.active),
          archivedAt: row.archivedAt ? parseDate(row.archivedAt) : null,
          preferredVendorId: row.preferredVendorId || null,
          strainId: row.strainId || null,
          createdAt: parseDate(row.createdAt),
          updatedAt: parseDate(row.updatedAt)
        }
      })
  );

  // Migrate Products
  await migrate(
    "products",
    "SELECT * FROM Product",
    (row: any) =>
      postgres.product.upsert({
        where: { id: row.id },
        update: {},
        create: {
          id: row.id,
          name: row.name,
          sku: row.sku,
          unitOfMeasure: row.unitOfMeasure,
          defaultBatchSize: row.defaultBatchSize || null,
          leadTimeDays: row.leadTimeDays,
          reorderPoint: row.reorderPoint,
          wholesalePrice: row.wholesalePrice || null,
          strainId: row.strainId || null,
          active: toBool(row.active),
          createdAt: parseDate(row.createdAt),
          updatedAt: parseDate(row.updatedAt)
        }
      })
  );

  // Migrate UnitConversions
  await migrate(
    "unit conversions",
    "SELECT * FROM UnitConversion",
    (row: any) =>
      postgres.unitConversion.upsert({
        where: { id: row.id },
        update: {},
        create: {
          id: row.id,
          fromUnit: row.fromUnit,
          toUnit: row.toUnit,
          factor: row.factor,
          createdAt: parseDate(row.createdAt),
          updatedAt: parseDate(row.updatedAt)
        }
      })
  );

  // Migrate MaterialVendors
  await migrate(
    "material vendors",
    "SELECT * FROM MaterialVendor",
    (row: any) =>
      postgres.materialVendor.upsert({
        where: { id: row.id },
        update: {},
        create: {
          id: row.id,
          materialId: row.materialId,
          vendorId: row.vendorId,
          vendorSku: row.vendorSku || null,
          isPreferred: toBool(row.isPreferred),
          createdAt: parseDate(row.createdAt),
          updatedAt: parseDate(row.updatedAt)
        }
      })
  );

  // Migrate MaterialCostHistory
  await migrate(
    "material cost history",
    "SELECT * FROM MaterialCostHistory",
    (row: any) =>
      postgres.materialCostHistory.upsert({
        where: { id: row.id },
        update: {},
        create: {
          id: row.id,
          materialId: row.materialId,
          cost: row.cost,
          effectiveDate: parseDate(row.effectiveDate),
          createdAt: parseDate(row.createdAt)
        }
      })
  );

  // Migrate BOMItems
  await migrate(
    "BOM items",
    "SELECT * FROM BOMItem",
    (row: any) =>
      postgres.bOMItem.upsert({
        where: { id: row.id },
        update: {},
        create: {
          id: row.id,
          productId: row.productId,
          materialId: row.materialId,
          quantityPerUnit: row.quantityPerUnit,
          version: row.version,
          active: toBool(row.active),
          createdAt: parseDate(row.createdAt)
        }
      })
  );

  console.log("Migration complete.");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    sqliteDb.close();
    await postgres.$disconnect();
  });


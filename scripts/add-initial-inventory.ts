/**
 * ONE-TIME SCRIPT: Add Initial Inventory
 * 
 * Usage:
 *   npx tsx scripts/add-initial-inventory.ts
 * 
 * This script helps you set up initial inventory quantities for materials
 * and products that already exist in the system.
 * 
 * Edit the INVENTORY_DATA array below with your actual quantities.
 */

import { PrismaClient, InventoryType, InventoryStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================
// EDIT THIS SECTION WITH YOUR INITIAL INVENTORY
// ============================================

interface InitialInventoryItem {
  type: 'MATERIAL' | 'PRODUCT';
  sku: string;              // Material or Product SKU
  quantity: number;         // Initial quantity on hand
  locationName?: string;    // Optional: location name (will use default if not specified)
  lotNumber?: string;       // Optional: lot/batch number
  expiryDate?: string;      // Optional: expiry date (YYYY-MM-DD format)
  unitCost?: number;        // Optional: cost per unit
  notes?: string;           // Optional: notes about this inventory
}

const INVENTORY_DATA: InitialInventoryItem[] = [
  // Example for materials:
  // { type: 'MATERIAL', sku: 'MAT-PE', quantity: 500 },
  // { type: 'MATERIAL', sku: 'MAT-GT', quantity: 300, lotNumber: 'LOT-001', expiryDate: '2026-12-31' },
  
  // Example for products:
  // { type: 'PRODUCT', sku: 'PROD-001', quantity: 100 },
  // { type: 'PRODUCT', sku: 'PROD-002', quantity: 50, locationName: 'Warehouse A' },
  
  // Add your inventory here:
];

// ============================================
// SCRIPT LOGIC (DO NOT EDIT BELOW)
// ============================================

async function main() {
  console.log('🏁 Starting initial inventory setup...\n');

  if (INVENTORY_DATA.length === 0) {
    console.log('⚠️  No inventory data specified.');
    console.log('📝 Edit the INVENTORY_DATA array in this script and try again.\n');
    return;
  }

  // Get default location
  const defaultLocation = await prisma.location.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' }
  });

  if (!defaultLocation) {
    console.error('❌ No active location found. Please create at least one location first.');
    process.exit(1);
  }

  console.log(`📍 Default location: ${defaultLocation.name}\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of INVENTORY_DATA) {
    try {
      console.log(`\n▶️  Processing ${item.type}: ${item.sku} (qty: ${item.quantity})`);

      // Find the material or product
      let entityId: string | null = null;
      let entityName: string | null = null;
      let unitOfMeasure: string | null = null;

      if (item.type === 'MATERIAL') {
        const material = await prisma.rawMaterial.findUnique({
          where: { sku: item.sku },
          select: { id: true, name: true, unitOfMeasure: true, currentStockQty: true }
        });

        if (!material) {
          console.log(`   ⚠️  Material with SKU "${item.sku}" not found - SKIPPING`);
          skipped++;
          continue;
        }

        entityId = material.id;
        entityName = material.name;
        unitOfMeasure = material.unitOfMeasure;

        // Check if inventory already exists for this material
        const existing = await prisma.inventoryItem.findFirst({
          where: {
            type: InventoryType.MATERIAL,
            materialId: entityId,
            status: InventoryStatus.AVAILABLE
          }
        });

        if (existing && existing.quantityOnHand > 0) {
          console.log(`   ⚠️  Inventory already exists for ${entityName} (${existing.quantityOnHand} ${unitOfMeasure}) - SKIPPING`);
          skipped++;
          continue;
        }

      } else if (item.type === 'PRODUCT') {
        const product = await prisma.product.findUnique({
          where: { sku: item.sku },
          select: { id: true, name: true, unitOfMeasure: true }
        });

        if (!product) {
          console.log(`   ⚠️  Product with SKU "${item.sku}" not found - SKIPPING`);
          skipped++;
          continue;
        }

        entityId = product.id;
        entityName = product.name;
        unitOfMeasure = product.unitOfMeasure;

        // Check if inventory already exists for this product
        const existing = await prisma.inventoryItem.findFirst({
          where: {
            type: InventoryType.PRODUCT,
            productId: entityId,
            status: InventoryStatus.AVAILABLE
          }
        });

        if (existing && existing.quantityOnHand > 0) {
          console.log(`   ⚠️  Inventory already exists for ${entityName} (${existing.quantityOnHand} ${unitOfMeasure}) - SKIPPING`);
          skipped++;
          continue;
        }
      }

      // Find location if specified
      let locationId = defaultLocation.id;
      if (item.locationName) {
        const location = await prisma.location.findFirst({
          where: { name: item.locationName, active: true }
        });
        if (location) {
          locationId = location.id;
        } else {
          console.log(`   ⚠️  Location "${item.locationName}" not found, using default`);
        }
      }

      // Parse expiry date if provided
      let expiryDate: Date | undefined;
      if (item.expiryDate) {
        expiryDate = new Date(item.expiryDate);
        if (isNaN(expiryDate.getTime())) {
          console.log(`   ⚠️  Invalid expiry date format, ignoring`);
          expiryDate = undefined;
        }
      }

      // Create inventory item
      const inventoryItem = await prisma.inventoryItem.create({
        data: {
          type: item.type === 'MATERIAL' ? InventoryType.MATERIAL : InventoryType.PRODUCT,
          materialId: item.type === 'MATERIAL' ? entityId : undefined,
          productId: item.type === 'PRODUCT' ? entityId : undefined,
          locationId,
          quantityOnHand: item.quantity,
          quantityReserved: 0,
          unitOfMeasure: unitOfMeasure!,
          unitCost: item.unitCost,
          status: InventoryStatus.AVAILABLE,
          lotNumber: item.lotNumber,
          expiryDate,
          source: 'MANUAL',
          externalRef: item.notes
        }
      });

      // Update material stock quantity if material
      if (item.type === 'MATERIAL') {
        await prisma.rawMaterial.update({
          where: { id: entityId! },
          data: { currentStockQty: { increment: item.quantity } }
        });
      }

      console.log(`   ✅ Created inventory for ${entityName}: ${item.quantity} ${unitOfMeasure}`);
      if (item.lotNumber) console.log(`      Lot: ${item.lotNumber}`);
      if (expiryDate) console.log(`      Expires: ${expiryDate.toLocaleDateString()}`);
      
      created++;

    } catch (error: any) {
      console.error(`   ❌ Error processing ${item.sku}: ${error.message}`);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY:');
  console.log(`   ✅ Created: ${created}`);
  console.log(`   ⚠️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log('='.repeat(60) + '\n');

  if (created > 0) {
    console.log('🎉 Initial inventory setup complete!');
    console.log('💡 You can now view your inventory at: /ops/inventory\n');
  }
}

main()
  .catch((e) => {
    console.error('❌ Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


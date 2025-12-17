import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { InventoryType, InventoryStatus } from '@prisma/client';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';

interface InventoryEntry {
  type: 'MATERIAL' | 'PRODUCT';
  entityId: string;
  quantity: string;
  locationId: string;
  lotNumber?: string;
  expiryDate?: string;
  unitCost?: string;
  notes?: string;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Only ADMIN and WAREHOUSE can add initial inventory
    if (session.user.role !== 'ADMIN' && session.user.role !== 'WAREHOUSE') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { entries }: { entries: InventoryEntry[] } = await req.json();

    if (!entries || entries.length === 0) {
      return NextResponse.json({ message: 'No entries provided' }, { status: 400 });
    }

    let created = 0;
    const results = [];

    for (const entry of entries) {
      // Validate required fields
      if (!entry.entityId || !entry.quantity || !entry.locationId) {
        continue;
      }

      const quantity = parseFloat(entry.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        continue;
      }

      try {
        // Get entity info
        let entityName = '';
        let unitOfMeasure = '';

        if (entry.type === 'MATERIAL') {
          const material = await prisma.rawMaterial.findUnique({
            where: { id: entry.entityId },
            select: { name: true, unitOfMeasure: true }
          });

          if (!material) continue;
          entityName = material.name;
          unitOfMeasure = material.unitOfMeasure;

        } else if (entry.type === 'PRODUCT') {
          const product = await prisma.product.findUnique({
            where: { id: entry.entityId },
            select: { name: true, unitOfMeasure: true }
          });

          if (!product) continue;
          entityName = product.name;
          unitOfMeasure = product.unitOfMeasure;
        }

        // Parse optional fields
        const unitCost = entry.unitCost ? parseFloat(entry.unitCost) : undefined;
        const expiryDate = entry.expiryDate ? new Date(entry.expiryDate) : undefined;

        // Create inventory item
        const inventoryItem = await prisma.inventoryItem.create({
          data: {
            type: entry.type === 'MATERIAL' ? InventoryType.MATERIAL : InventoryType.PRODUCT,
            materialId: entry.type === 'MATERIAL' ? entry.entityId : undefined,
            productId: entry.type === 'PRODUCT' ? entry.entityId : undefined,
            locationId: entry.locationId,
            quantityOnHand: quantity,
            quantityReserved: 0,
            unitOfMeasure,
            unitCost: unitCost && !isNaN(unitCost) ? unitCost : undefined,
            status: InventoryStatus.AVAILABLE,
            lotNumber: entry.lotNumber || undefined,
            expiryDate,
            source: 'MANUAL',
            externalRef: entry.notes || undefined
          }
        });

        // Update material stock quantity if material
        if (entry.type === 'MATERIAL') {
          await prisma.rawMaterial.update({
            where: { id: entry.entityId },
            data: { currentStockQty: { increment: quantity } }
          });
        }

        // Log the action
        await logAction({
          entityType: ActivityEntity.INVENTORY,
          entityId: inventoryItem.id,
          action: 'initial_inventory_created',
          userId: session.user.id,
          summary: `Added initial inventory: ${quantity} ${unitOfMeasure} of ${entityName}`,
          metadata: {
            type: entry.type,
            entityId: entry.entityId,
            entityName,
            quantity,
            locationId: entry.locationId,
            lotNumber: entry.lotNumber,
            expiryDate: entry.expiryDate,
            unitCost,
            notes: entry.notes
          },
          tags: ['inventory', 'initial-setup']
        });

        results.push({
          success: true,
          entityName,
          quantity,
          unitOfMeasure
        });
        created++;

      } catch (error: any) {
        console.error('Error creating inventory entry:', error);
        results.push({
          success: false,
          error: error.message
        });
      }
    }

    return NextResponse.json({
      message: `Successfully created ${created} inventory item(s)`,
      created,
      results
    });

  } catch (error: any) {
    console.error('Error in initial inventory setup:', error);
    return NextResponse.json(
      { message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


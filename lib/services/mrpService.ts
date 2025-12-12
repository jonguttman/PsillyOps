// MRP SERVICE - Material Requirements Planning
// Handles production order creation, material shortage detection, and PO generation

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction, generateSummary } from './loggingService';
import { ActivityEntity } from '@prisma/client';
import { generateOrderNumber } from '@/lib/utils/formatters';

export interface MaterialRequirement {
  materialId: string;
  materialName: string;
  materialSku: string;
  quantityRequired: number;
  quantityAvailable: number;
  quantityShortage: number;
  preferredVendorId: string | null;
}

export interface ProductionOrderSuggestion {
  productId: string;
  productName: string;
  quantityToMake: number;
  reason: string;
  materialRequirements: MaterialRequirement[];
}

/**
 * Check material requirements for a production order
 * Returns material shortages if any
 */
export async function checkMaterialRequirements(
  productId: string,
  quantityToMake: number
): Promise<MaterialRequirement[]> {
  // Get BOM for product
  const bomItems = await prisma.bOMItem.findMany({
    where: {
      productId,
      active: true
    },
    include: {
      material: true
    }
  });

  if (bomItems.length === 0) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'No BOM defined for this product'
    );
  }

  const requirements: MaterialRequirement[] = [];

  for (const bomItem of bomItems) {
    const quantityRequired = bomItem.quantityPerUnit * quantityToMake;
    
    // Calculate available material quantity
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: {
        materialId: bomItem.materialId,
        type: 'MATERIAL',
        status: 'AVAILABLE'
      }
    });

    const quantityAvailable = inventoryItems.reduce(
      (sum, item) => sum + (item.quantityOnHand - item.quantityReserved),
      0
    );

    const quantityShortage = Math.max(0, quantityRequired - quantityAvailable);

    requirements.push({
      materialId: bomItem.materialId,
      materialName: bomItem.material.name,
      materialSku: bomItem.material.sku,
      quantityRequired,
      quantityAvailable,
      quantityShortage,
      preferredVendorId: bomItem.material.preferredVendorId
    });
  }

  return requirements;
}

/**
 * Create production orders for product shortages
 */
export async function createProductionOrdersForShortages(
  shortages: { productId: string; quantity: number; linkedOrderIds?: string[] }[],
  userId: string
): Promise<string[]> {
  const createdOrderIds: string[] = [];

  for (const shortage of shortages) {
    const product = await prisma.product.findUnique({
      where: { id: shortage.productId }
    });

    if (!product) continue;

    // Calculate material requirements
    const materialRequirements = await checkMaterialRequirements(
      shortage.productId,
      shortage.quantity
    );

    // Create production order
    const productionOrder = await prisma.productionOrder.create({
      data: {
        orderNumber: generateOrderNumber('PROD'),
        productId: shortage.productId,
        quantityToMake: shortage.quantity,
        status: 'PLANNED',
        createdByUserId: userId,
        linkedRetailerOrderIds: shortage.linkedOrderIds || [],
        materialRequirements: materialRequirements
      }
    });

    createdOrderIds.push(productionOrder.id);

    // Log production order creation
    await logAction({
      entityType: ActivityEntity.PRODUCTION_ORDER,
      entityId: productionOrder.id,
      action: 'created',
      userId,
      summary: generateSummary({
        userName: 'System',
        action: 'created',
        entityName: `production order ${productionOrder.orderNumber}`,
        details: {
          product: product.name,
          quantity: shortage.quantity
        }
      }),
      details: {
        productId: shortage.productId,
        productName: product.name,
        quantityToMake: shortage.quantity,
        materialRequirements
      },
      tags: ['system', 'created']
    });

    // Check for material shortages and log
    const hasShortages = materialRequirements.some(m => m.quantityShortage > 0);
    if (hasShortages) {
      await logAction({
        entityType: ActivityEntity.PRODUCTION_ORDER,
        entityId: productionOrder.id,
        action: 'material_shortage_detected',
        userId,
        summary: `Material shortages detected for production order ${productionOrder.orderNumber}`,
        details: {
          shortages: materialRequirements.filter(m => m.quantityShortage > 0)
        },
        tags: ['shortage', 'risk', 'system']
      });
    }
  }

  return createdOrderIds;
}

/**
 * Create purchase orders for material shortages
 * Groups by vendor
 */
export async function createPurchaseOrdersForMaterialShortages(
  materialShortages: { materialId: string; quantity: number }[],
  userId: string
): Promise<string[]> {
  // Group shortages by vendor
  const vendorGroups = new Map<string, { materialId: string; quantity: number }[]>();

  for (const shortage of materialShortages) {
    const material = await prisma.rawMaterial.findUnique({
      where: { id: shortage.materialId }
    });

    if (!material || !material.preferredVendorId) continue;

    const vendorId = material.preferredVendorId;
    if (!vendorGroups.has(vendorId)) {
      vendorGroups.set(vendorId, []);
    }
    vendorGroups.get(vendorId)!.push(shortage);
  }

  const createdPOIds: string[] = [];

  // Create PO for each vendor
  for (const [vendorId, items] of vendorGroups) {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId }
    });

    if (!vendor) continue;

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        poNumber: generateOrderNumber('PO'),
        vendorId,
        status: 'DRAFT',
        createdByUserId: userId,
        lineItems: {
          create: items.map(item => ({
            materialId: item.materialId,
            quantityOrdered: item.quantity
          }))
        }
      },
      include: {
        lineItems: {
          include: {
            material: true
          }
        }
      }
    });

    createdPOIds.push(purchaseOrder.id);

    // Log PO creation
    await logAction({
      entityType: ActivityEntity.PURCHASE_ORDER,
      entityId: purchaseOrder.id,
      action: 'created',
      userId,
      summary: generateSummary({
        userName: 'System',
        action: 'created',
        entityName: `purchase order ${purchaseOrder.poNumber}`,
        details: {
          vendor: vendor.name,
          itemCount: items.length
        }
      }),
      details: {
        vendorId,
        vendorName: vendor.name,
        lineItems: purchaseOrder.lineItems.map(li => ({
          materialName: li.material.name,
          quantity: li.quantityOrdered
        }))
      },
      tags: ['system', 'created']
    });
  }

  return createdPOIds;
}

/**
 * Check reorder points and suggest production orders
 * This runs as a scheduled job
 */
export async function checkReorderPoints(userId: string): Promise<{
  productSuggestions: ProductionOrderSuggestion[];
  materialShortages: { materialId: string; materialName: string; shortage: number }[];
}> {
  const productSuggestions: ProductionOrderSuggestion[] = [];
  const materialShortages: { materialId: string; materialName: string; shortage: number }[] = [];

  // Check products below reorder point
  const products = await prisma.product.findMany({
    where: {
      active: true,
      reorderPoint: { gt: 0 }
    }
  });

  for (const product of products) {
    // Calculate available stock
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: {
        productId: product.id,
        type: 'PRODUCT',
        status: 'AVAILABLE'
      }
    });

    const availableStock = inventoryItems.reduce(
      (sum, item) => sum + (item.quantityOnHand - item.quantityReserved),
      0
    );

    if (availableStock < product.reorderPoint) {
      const quantityToMake = product.defaultBatchSize || product.reorderPoint;
      const materialReqs = await checkMaterialRequirements(product.id, quantityToMake);

      productSuggestions.push({
        productId: product.id,
        productName: product.name,
        quantityToMake,
        reason: `Stock (${availableStock}) below reorder point (${product.reorderPoint})`,
        materialRequirements: materialReqs
      });

      // Log reorder suggestion
      await logAction({
        entityType: ActivityEntity.PRODUCT,
        entityId: product.id,
        action: 'reorder_point_triggered',
        userId,
        summary: `Product ${product.name} below reorder point`,
        details: {
          availableStock,
          reorderPoint: product.reorderPoint,
          suggestedQuantity: quantityToMake
        },
        tags: ['system', 'risk', 'reorder']
      });
    }
  }

  // Check materials below reorder point
  const materials = await prisma.rawMaterial.findMany({
    where: {
      active: true,
      reorderPoint: { gt: 0 }
    }
  });

  for (const material of materials) {
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: {
        materialId: material.id,
        type: 'MATERIAL',
        status: 'AVAILABLE'
      }
    });

    const availableStock = inventoryItems.reduce(
      (sum, item) => sum + (item.quantityOnHand - item.quantityReserved),
      0
    );

    if (availableStock < material.reorderPoint) {
      const shortage = material.reorderPoint - availableStock;
      materialShortages.push({
        materialId: material.id,
        materialName: material.name,
        shortage
      });

      // Log material shortage
      await logAction({
        entityType: ActivityEntity.MATERIAL,
        entityId: material.id,
        action: 'reorder_point_triggered',
        userId,
        summary: `Material ${material.name} below reorder point`,
        details: {
          availableStock,
          reorderPoint: material.reorderPoint,
          shortage
        },
        tags: ['system', 'risk', 'shortage', 'reorder']
      });
    }
  }

  return {
    productSuggestions,
    materialShortages
  };
}



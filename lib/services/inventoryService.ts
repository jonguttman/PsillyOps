// INVENTORY SERVICE - Stock adjustments and movements
// ALL business logic for inventory operations

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction, generateSummary } from './loggingService';
import { ActivityEntity, InventoryType, MovementType, InventoryStatus } from '@prisma/client';
import { createInventoryAdjustment } from '@/lib/services/inventoryAdjustmentService';
import { InventoryAdjustmentType } from '@prisma/client';

// ========================================
// INVENTORY LIST & DETAIL
// ========================================

export interface InventoryFilter {
  type?: InventoryType;
  locationId?: string;
  productId?: string;
  materialId?: string;
  batchId?: string;
  status?: InventoryStatus;
  search?: string;
  hasExpiry?: boolean;
  expiringWithinDays?: number;
  limit?: number;
  offset?: number;
}

/**
 * Get materials currently below their reorder point.
 * Read-only helper for dashboard supply awareness.
 */
export async function getLowStockMaterials() {
  const materials = await prisma.rawMaterial.findMany({
    where: {
      active: true,
      reorderPoint: { gt: 0 },
    },
    select: {
      id: true,
      name: true,
      sku: true,
      unitOfMeasure: true,
      currentStockQty: true,
      reorderPoint: true,
    },
    orderBy: [{ currentStockQty: 'asc' }],
  });

  const low = materials.filter((m) => m.currentStockQty < m.reorderPoint);
  return { materials: low };
}

/**
 * Get paginated inventory list with filters
 */
export async function getInventoryList(filter: InventoryFilter = {}) {
  const where: any = {};

  if (filter.type) where.type = filter.type;
  if (filter.locationId) where.locationId = filter.locationId;
  if (filter.productId) where.productId = filter.productId;
  if (filter.materialId) where.materialId = filter.materialId;
  if (filter.batchId) where.batchId = filter.batchId;
  if (filter.status) where.status = filter.status;

  if (filter.search) {
    where.OR = [
      { product: { name: { contains: filter.search } } },
      { material: { name: { contains: filter.search } } },
      { lotNumber: { contains: filter.search } }
    ];
  }

  if (filter.hasExpiry) {
    where.expiryDate = { not: null };
  }

  if (filter.expiringWithinDays) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + filter.expiringWithinDays);
    where.expiryDate = { lte: futureDate, not: null };
  }

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        material: { select: { id: true, name: true, sku: true } },
        location: { select: { id: true, name: true, type: true } },
        batch: { select: { id: true, batchCode: true, status: true } }
      },
      orderBy: [
        { expiryDate: 'asc' },
        { createdAt: 'desc' }
      ],
      take: filter.limit || 50,
      skip: filter.offset || 0
    }),
    prisma.inventoryItem.count({ where })
  ]);

  return { items, total };
}

/**
 * Get inventory item detail with movement history
 */
export async function getInventoryDetail(inventoryId: string) {
  const inventory = await prisma.inventoryItem.findUnique({
    where: { id: inventoryId },
    include: {
      product: true,
      material: true,
      location: true,
      batch: {
        include: {
          product: true
        }
      }
    }
  });

  if (!inventory) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Inventory item not found');
  }

  // Get movement history for this inventory item
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      OR: [
        { inventoryId },
        { materialId: inventory.materialId, productId: null },
        { productId: inventory.productId, materialId: null },
        { batchId: inventory.batchId }
      ].filter(Boolean)
    },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  return { inventory, movements };
}

// ========================================
// MOVEMENT TRACKING HELPER
// ========================================

/**
 * Create an inventory movement record
 */
async function createMovement(params: {
  inventoryId?: string;
  materialId?: string;
  productId?: string;
  batchId?: string;
  type: MovementType;
  quantity: number;
  fromLocation?: string;
  toLocation?: string;
  reason?: string;
  reference?: string;
  userId?: string;
}) {
  return prisma.inventoryMovement.create({
    data: {
      inventoryId: params.inventoryId,
      materialId: params.materialId,
      productId: params.productId,
      batchId: params.batchId,
      type: params.type,
      quantity: params.quantity,
      fromLocation: params.fromLocation,
      toLocation: params.toLocation,
      reason: params.reason,
      reference: params.reference,
      userId: params.userId
    }
  });
}

// ========================================
// RESERVATIONS
// ========================================

/**
 * Reserve inventory quantity
 */
export async function reserveInventory(params: {
  inventoryId: string;
  quantity: number;
  context: string;
  reference?: string;
  userId?: string;
}): Promise<void> {
  const { inventoryId, quantity, context, reference, userId } = params;

  const inventory = await prisma.inventoryItem.findUnique({
    where: { id: inventoryId },
    include: { product: true, material: true, location: true }
  });

  if (!inventory) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Inventory item not found');
  }

  const availableQty = inventory.quantityOnHand - inventory.quantityReserved;

  if (quantity > availableQty) {
    throw new AppError(
      ErrorCodes.INSUFFICIENT_INVENTORY,
      `Only ${availableQty} units available to reserve`
    );
  }

  await prisma.inventoryItem.update({
    where: { id: inventoryId },
    data: {
      quantityReserved: {
        increment: quantity
      }
    }
  });

  // Create movement record
  await createMovement({
    inventoryId,
    materialId: inventory.materialId || undefined,
    productId: inventory.productId || undefined,
    batchId: inventory.batchId || undefined,
    type: MovementType.RESERVE,
    quantity,
    reason: context,
    reference,
    userId
  });

  const itemName = inventory.product?.name || inventory.material?.name || 'Item';

  await logAction({
    entityType: ActivityEntity.INVENTORY,
    entityId: inventoryId,
    action: 'reserved',
    userId,
    summary: `Reserved ${quantity} ${itemName} - ${context}`,
    before: { quantityReserved: inventory.quantityReserved },
    after: { quantityReserved: inventory.quantityReserved + quantity },
    metadata: { inventoryId, quantity, context, reference },
    tags: ['reservation']
  });
}

/**
 * Release inventory reservation
 */
export async function releaseReservation(params: {
  inventoryId: string;
  quantity: number;
  context: string;
  reference?: string;
  userId?: string;
}): Promise<void> {
  const { inventoryId, quantity, context, reference, userId } = params;

  const inventory = await prisma.inventoryItem.findUnique({
    where: { id: inventoryId },
    include: { product: true, material: true, location: true }
  });

  if (!inventory) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Inventory item not found');
  }

  if (quantity > inventory.quantityReserved) {
    throw new AppError(
      ErrorCodes.INVALID_OPERATION,
      `Cannot release ${quantity} - only ${inventory.quantityReserved} reserved`
    );
  }

  await prisma.inventoryItem.update({
    where: { id: inventoryId },
    data: {
      quantityReserved: {
        decrement: quantity
      }
    }
  });

  // Create movement record
  await createMovement({
    inventoryId,
    materialId: inventory.materialId || undefined,
    productId: inventory.productId || undefined,
    batchId: inventory.batchId || undefined,
    type: MovementType.RELEASE,
    quantity,
    reason: context,
    reference,
    userId
  });

  const itemName = inventory.product?.name || inventory.material?.name || 'Item';

  await logAction({
    entityType: ActivityEntity.INVENTORY,
    entityId: inventoryId,
    action: 'reservation_released',
    userId,
    summary: `Released reservation of ${quantity} ${itemName} - ${context}`,
    before: { quantityReserved: inventory.quantityReserved },
    after: { quantityReserved: inventory.quantityReserved - quantity },
    metadata: { inventoryId, quantity, context, reference },
    tags: ['reservation']
  });
}

// ========================================
// MATERIAL CONSUMPTION (FIFO)
// ========================================

/**
 * Consume materials using FIFO by expiry date
 */
export async function consumeMaterial(params: {
  materialId: string;
  quantity: number;
  productionOrderId?: string;
  batchId?: string;
  reason?: string;
  userId?: string;
}): Promise<{ consumed: number; items: Array<{ inventoryId: string; quantity: number }> }> {
  const { materialId, quantity, productionOrderId, batchId, reason, userId } = params;

  const material = await prisma.rawMaterial.findUnique({
    where: { id: materialId }
  });

  if (!material) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Material not found');
  }

  // Get available inventory items sorted by expiry (FIFO)
  const inventoryItems = await prisma.inventoryItem.findMany({
    where: {
      materialId,
      type: InventoryType.MATERIAL,
      status: InventoryStatus.AVAILABLE,
      quantityOnHand: { gt: 0 }
    },
    orderBy: [
      { expiryDate: 'asc' },
      { createdAt: 'asc' }
    ],
    include: { location: true }
  });

  let remainingToConsume = quantity;
  const consumedItems: Array<{ inventoryId: string; quantity: number }> = [];

  for (const item of inventoryItems) {
    if (remainingToConsume <= 0) break;

    const available = item.quantityOnHand - item.quantityReserved;
    if (available <= 0) continue;

    const toConsume = Math.min(available, remainingToConsume);

    // Update inventory
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        quantityOnHand: {
          decrement: toConsume
        }
      }
    });

    // Create movement record
    await createMovement({
      inventoryId: item.id,
      materialId,
      batchId,
      type: MovementType.CONSUME,
      quantity: toConsume,
      fromLocation: item.location.name,
      reason: reason || `Production consumption`,
      reference: productionOrderId,
      userId
    });

    consumedItems.push({ inventoryId: item.id, quantity: toConsume });
    remainingToConsume -= toConsume;
  }

  const totalConsumed = quantity - remainingToConsume;

  // Update material current stock
  if (totalConsumed > 0) {
    await prisma.rawMaterial.update({
      where: { id: materialId },
      data: {
        currentStockQty: {
          decrement: totalConsumed
        }
      }
    });

    await logAction({
      entityType: ActivityEntity.MATERIAL,
      entityId: materialId,
      action: 'consumed',
      userId,
      summary: `Consumed ${totalConsumed} ${material.name} for production`,
      metadata: {
        quantity: totalConsumed,
        productionOrderId,
        batchId,
        items: consumedItems
      },
      tags: ['consumption', 'production']
    });
  }

  return { consumed: totalConsumed, items: consumedItems };
}

// ========================================
// FINISHED GOODS PRODUCTION
// ========================================

/**
 * Produce finished goods inventory from a batch
 */
export async function produceFinishedGoods(params: {
  productId: string;
  batchId: string;
  quantity: number;
  locationId: string;
  unitCost?: number;
  productionOrderId?: string;
  userId?: string;
}): Promise<string> {
  const { productId, batchId, quantity, locationId, unitCost, productionOrderId, userId } = params;

  const product = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!product) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
  }

  const batch = await prisma.batch.findUnique({
    where: { id: batchId }
  });

  if (!batch) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
  }

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, name: true, active: true },
  });

  if (!location) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Location not found');
  }

  // Validate location is active
  if (!location.active) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `Location "${location.name}" is inactive. Please select an active location.`
    );
  }

  // Check if inventory already exists for this batch at this location
  const existingInventory = await prisma.inventoryItem.findFirst({
    where: {
      productId,
      batchId,
      locationId,
      type: InventoryType.PRODUCT,
      status: InventoryStatus.AVAILABLE
    }
  });

  let inventoryId: string;

  if (existingInventory) {
    inventoryId = existingInventory.id;
  } else {
    // Create new inventory item
    const newInventory = await prisma.inventoryItem.create({
      data: {
        type: InventoryType.PRODUCT,
        productId,
        batchId,
        locationId,
        quantityOnHand: 0,
        unitOfMeasure: product.unitOfMeasure,
        status: InventoryStatus.AVAILABLE,
        unitCost,
        source: 'PRODUCTION'
      }
    });
    inventoryId = newInventory.id;
  }

  // Apply quantity via InventoryAdjustment (no silent mutations)
  await createInventoryAdjustment({
    inventoryId,
    deltaQty: Math.trunc(quantity),
    reason: `Production complete: batch ${batch.batchCode}`,
    adjustmentType: InventoryAdjustmentType.PRODUCTION_COMPLETE,
    relatedEntityType: productionOrderId ? ActivityEntity.PRODUCTION_ORDER : undefined,
    relatedEntityId: productionOrderId,
    userId,
  });

  await logAction({
    entityType: ActivityEntity.PRODUCT,
    entityId: productId,
    action: 'produced',
    userId,
    summary: `Produced ${quantity} ${product.name} from batch ${batch.batchCode}`,
    metadata: {
      productId,
      batchId,
      batchCode: batch.batchCode,
      quantity,
      locationId,
      locationName: location.name,
      unitCost,
      inventoryId
    },
    tags: ['production']
  });

  return inventoryId;
}

// ========================================
// EXISTING FUNCTIONS (ENHANCED WITH MOVEMENTS)
// ========================================

/**
 * Adjust inventory quantity (add or remove stock)
 */
export async function adjustInventory(params: {
  inventoryId: string;
  deltaQuantity: number;
  reason: string;
  userId: string;
}): Promise<void> {
  const { inventoryId, deltaQuantity, reason, userId } = params;

  await createInventoryAdjustment({
    inventoryId,
    deltaQty: Math.trunc(deltaQuantity),
    reason,
    adjustmentType: InventoryAdjustmentType.MANUAL_CORRECTION,
    userId,
  });
}

/**
 * Move inventory between locations
 */
export async function moveInventory(params: {
  inventoryId: string;
  toLocationId: string;
  quantity: number;
  reason?: string;
  userId: string;
}): Promise<void> {
  const { inventoryId, toLocationId, quantity, reason, userId } = params;

  const inventory = await prisma.inventoryItem.findUnique({
    where: { id: inventoryId },
    include: {
      product: true,
      material: true,
      location: true
    }
  });

  if (!inventory) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Inventory item not found');
  }

  const toLocation = await prisma.location.findUnique({
    where: { id: toLocationId }
  });

  if (!toLocation) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Destination location not found');
  }

  const availableQty = inventory.quantityOnHand - inventory.quantityReserved;

  if (quantity > availableQty) {
    throw new AppError(
      ErrorCodes.INSUFFICIENT_INVENTORY,
      `Only ${availableQty} units available to move (${inventory.quantityReserved} reserved)`
    );
  }

  const itemName = inventory.product?.name || inventory.material?.name || 'Item';

  // If moving full available quantity, update location
  // Otherwise, create new inventory item at destination
  if (quantity === inventory.quantityOnHand) {
    const before = {
      locationId: inventory.locationId
    };

    await prisma.inventoryItem.update({
      where: { id: inventoryId },
      data: {
        locationId: toLocationId
      }
    });

    // Create movement record
    await createMovement({
      inventoryId,
      materialId: inventory.materialId || undefined,
      productId: inventory.productId || undefined,
      batchId: inventory.batchId || undefined,
      type: MovementType.MOVE,
      quantity,
      fromLocation: inventory.location.name,
      toLocation: toLocation.name,
      reason,
      userId
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });

    await logAction({
      entityType: inventory.type === InventoryType.PRODUCT ? ActivityEntity.PRODUCT : ActivityEntity.MATERIAL,
      entityId: inventory.productId || inventory.materialId || inventoryId,
      action: 'moved',
      userId,
      summary: generateSummary({
        userName: user?.name || 'User',
        action: 'moved',
        entityName: `${quantity} ${itemName}`,
        metadata: {
          from: inventory.location.name,
          to: toLocation.name,
          quantity,
          reason
        }
      }),
      before,
      after: {
        locationId: toLocationId
      },
      metadata: {
        inventoryId,
        fromLocation: inventory.location.name,
        toLocation: toLocation.name,
        quantity,
        reason
      },
      tags: ['movement']
    });
  } else {
    // Partial move: split inventory
    await prisma.inventoryItem.update({
      where: { id: inventoryId },
      data: {
        quantityOnHand: {
          decrement: quantity
        }
      }
    });

    // Check if destination already has inventory for this item
    const existingAtDestination = await prisma.inventoryItem.findFirst({
      where: {
        type: inventory.type,
        productId: inventory.productId,
        materialId: inventory.materialId,
        batchId: inventory.batchId,
        locationId: toLocationId,
        status: inventory.status,
        lotNumber: inventory.lotNumber
      }
    });

    let destinationInventoryId: string;

    if (existingAtDestination) {
      // Add to existing
      await prisma.inventoryItem.update({
        where: { id: existingAtDestination.id },
        data: {
          quantityOnHand: {
            increment: quantity
          }
        }
      });
      destinationInventoryId = existingAtDestination.id;
    } else {
      // Create new inventory item at destination
      const newItem = await prisma.inventoryItem.create({
        data: {
          type: inventory.type,
          productId: inventory.productId,
          materialId: inventory.materialId,
          batchId: inventory.batchId,
          locationId: toLocationId,
          quantityOnHand: quantity,
          unitOfMeasure: inventory.unitOfMeasure,
          status: inventory.status,
          lotNumber: inventory.lotNumber,
          expiryDate: inventory.expiryDate,
          unitCost: inventory.unitCost,
          source: inventory.source
        }
      });
      destinationInventoryId = newItem.id;
    }

    // Create movement record
    await createMovement({
      inventoryId,
      materialId: inventory.materialId || undefined,
      productId: inventory.productId || undefined,
      batchId: inventory.batchId || undefined,
      type: MovementType.MOVE,
      quantity,
      fromLocation: inventory.location.name,
      toLocation: toLocation.name,
      reason,
      userId
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });

    await logAction({
      entityType: inventory.type === InventoryType.PRODUCT ? ActivityEntity.PRODUCT : ActivityEntity.MATERIAL,
      entityId: inventory.productId || inventory.materialId || inventoryId,
      action: 'moved',
      userId,
      summary: generateSummary({
        userName: user?.name || 'User',
        action: 'moved',
        entityName: `${quantity} ${itemName}`,
        metadata: {
          from: inventory.location.name,
          to: toLocation.name,
          quantity,
          reason
        }
      }),
      metadata: {
        inventoryId,
        destinationInventoryId,
        fromLocation: inventory.location.name,
        toLocation: toLocation.name,
        quantity,
        reason
      },
      tags: ['movement']
    });
  }
}

/**
 * Get available inventory for a product
 */
export async function getAvailableInventory(productId: string): Promise<number> {
  const items = await prisma.inventoryItem.findMany({
    where: {
      productId,
      type: 'PRODUCT',
      status: 'AVAILABLE'
    }
  });

  return items.reduce((sum, item) => sum + (item.quantityOnHand - item.quantityReserved), 0);
}

/**
 * Get available material stock
 */
export async function getAvailableMaterialStock(materialId: string): Promise<number> {
  const items = await prisma.inventoryItem.findMany({
    where: {
      materialId,
      type: 'MATERIAL',
      status: 'AVAILABLE'
    }
  });

  return items.reduce((sum, item) => sum + (item.quantityOnHand - item.quantityReserved), 0);
}

// ========================================
// DEFAULT LOCATION RESOLUTION HELPERS
// ========================================

/**
 * Resolve the preferred storage location for a product.
 * Returns the product's defaultLocationId if set, otherwise null.
 * 
 * NOTE: This is preparatory work for hierarchy and fulfillment.
 * It is NOT automatically called during inventory creation.
 * Callers must explicitly use this if they want default behavior.
 * 
 * @param productId - The product ID to resolve location for
 * @returns Location info or null if no default configured
 */
export async function resolveProductDefaultLocation(productId: string): Promise<{
  id: string;
  name: string;
  type: string;
  active: boolean;
} | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      defaultLocation: {
        select: { id: true, name: true, type: true, active: true },
      },
    },
  });

  if (!product?.defaultLocation) {
    return null;
  }

  return product.defaultLocation;
}

/**
 * Resolve the preferred storage location for a material.
 * Follows fallback chain: material.defaultLocationId → system default receiving.
 * 
 * @param materialId - The material ID to resolve location for
 * @returns Location info or null if no default configured
 */
export async function resolveMaterialDefaultLocation(materialId: string): Promise<{
  id: string;
  name: string;
  type: string;
  active: boolean;
} | null> {
  const material = await prisma.rawMaterial.findUnique({
    where: { id: materialId },
    select: {
      defaultLocation: {
        select: { id: true, name: true, type: true, active: true },
      },
    },
  });

  // First try material's default
  if (material?.defaultLocation) {
    return material.defaultLocation;
  }

  // Fallback to system default receiving location
  const systemDefault = await prisma.location.findFirst({
    where: { isDefaultReceiving: true, active: true },
    select: { id: true, name: true, type: true, active: true },
  });

  return systemDefault;
}

// ========================================
// MATERIAL RECEIVING
// ========================================

/**
 * Receive materials from purchase order
 */
export async function receiveMaterials(params: {
  materialId: string;
  quantity: number;
  locationId?: string;
  lotNumber?: string;
  expiryDate?: Date;
  unitCost?: number;
  purchaseOrderId?: string;
  userId: string;
}): Promise<string> {
  const { materialId, quantity, lotNumber, expiryDate, unitCost, purchaseOrderId, userId } = params;
  let { locationId } = params;

  // Fetch material with defaultLocationId
  const material = await prisma.rawMaterial.findUnique({
    where: { id: materialId },
    include: {
      defaultLocation: { select: { id: true, name: true, active: true } },
    },
  });

  if (!material) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Material not found');
  }

  // Resolve location with fallback chain
  let location: { id: string; name: string; active: boolean } | null = null;

  // 1. If locationId explicitly provided, use it
  if (locationId) {
    location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, name: true, active: true },
    });
    if (!location) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Specified location not found');
    }
  }
  // 2. Fallback to material's default location
  else if (material.defaultLocation) {
    location = material.defaultLocation;
    locationId = location.id;
  }
  // 3. Fallback to system default receiving location
  else {
    location = await prisma.location.findFirst({
      where: { isDefaultReceiving: true, active: true },
      select: { id: true, name: true, active: true },
    });
    if (location) {
      locationId = location.id;
    }
  }

  // If no location resolved, throw explicit error
  if (!location || !locationId) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'No receiving location configured. Set a material default location or system default receiving location in Settings → Locations.'
    );
  }

  // Validate location is active
  if (!location.active) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `Location "${location.name}" is inactive. Please select an active location or update the default.`
    );
  }

  // Create inventory item
  const inventoryItem = await prisma.inventoryItem.create({
    data: {
      type: InventoryType.MATERIAL,
      materialId,
      locationId,
      quantityOnHand: quantity,
      unitOfMeasure: material.unitOfMeasure,
      status: InventoryStatus.AVAILABLE,
      lotNumber,
      expiryDate,
      unitCost,
      source: purchaseOrderId ? 'PURCHASE_ORDER' : 'MANUAL'
    }
  });

  // Create movement record
  await createMovement({
    inventoryId: inventoryItem.id,
    materialId,
    type: MovementType.RECEIVE,
    quantity,
    toLocation: location.name,
    reason: lotNumber ? `Lot: ${lotNumber}` : 'Material receipt',
    reference: purchaseOrderId,
    userId
  });

  // Update material current stock
  await prisma.rawMaterial.update({
    where: { id: materialId },
    data: {
      currentStockQty: {
        increment: quantity
      }
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.MATERIAL,
    entityId: materialId,
    action: 'received',
    userId,
    summary: generateSummary({
      userName: user?.name || 'User',
      action: 'received',
      entityName: `${quantity} ${material.name}`,
      metadata: {
        lotNumber
      }
    }),
    metadata: {
      materialName: material.name,
      quantity,
      lotNumber,
      expiryDate,
      unitCost,
      purchaseOrderId,
      inventoryItemId: inventoryItem.id,
      locationName: location.name
    },
    tags: ['receiving']
  });

  return inventoryItem.id;
}

// ========================================
// INVENTORY MOVEMENTS QUERY
// ========================================

/**
 * Get movement history for an entity
 */
export async function getMovementHistory(params: {
  inventoryId?: string;
  materialId?: string;
  productId?: string;
  batchId?: string;
  type?: MovementType;
  limit?: number;
  offset?: number;
}) {
  const where: any = {};

  if (params.inventoryId) where.inventoryId = params.inventoryId;
  if (params.materialId) where.materialId = params.materialId;
  if (params.productId) where.productId = params.productId;
  if (params.batchId) where.batchId = params.batchId;
  if (params.type) where.type = params.type;

  const [movements, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit || 50,
      skip: params.offset || 0
    }),
    prisma.inventoryMovement.count({ where })
  ]);

  return { movements, total };
}


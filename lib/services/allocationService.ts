// ALLOCATION SERVICE - Order allocation logic (FIFO)
// ALL business logic for allocating inventory to orders

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction, generateSummary } from './loggingService';
import { ActivityEntity, InventoryStatus } from '@prisma/client';

export interface AllocationResult {
  orderId: string;
  lineAllocations: {
    lineItemId: string;
    productId: string;
    quantityOrdered: number;
    quantityAllocated: number;
    shortageQuantity: number;
    allocations: {
      inventoryId: string;
      batchId: string | null;
      quantity: number;
    }[];
  }[];
  totalShortages: number;
}

/**
 * Allocate inventory to an order using FIFO by batch production date
 */
export async function allocateOrder(
  orderId: string,
  userId?: string
): Promise<AllocationResult> {
  const order = await prisma.retailerOrder.findUnique({
    where: { id: orderId },
    include: {
      lineItems: {
        include: {
          product: true
        }
      },
      retailer: true,
      createdBy: true
    }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found');
  }

  if (order.status !== 'DRAFT' && order.status !== 'SUBMITTED') {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Order cannot be allocated in current status'
    );
  }

  const lineAllocations: AllocationResult['lineAllocations'] = [];
  let totalShortages = 0;

  // Process each line item
  for (const line of order.lineItems) {
    const allocation = await allocateLineItem(line.id, line.productId, line.quantityOrdered);
    lineAllocations.push(allocation);
    totalShortages += allocation.shortageQuantity;

    // Update line item in database
    await prisma.orderLineItem.update({
      where: { id: line.id },
      data: {
        quantityAllocated: allocation.quantityAllocated,
        shortageQuantity: allocation.shortageQuantity,
        allocationDetails: allocation.allocations
      }
    });
  }

  // Log allocation action
  await logAction({
    entityType: ActivityEntity.ORDER,
    entityId: orderId,
    action: 'allocated',
    userId,
    summary: generateSummary({
      userName: order.createdBy.name,
      action: 'allocated',
      entityName: `order ${order.orderNumber}`,
      details: {
        totalShortages,
        retailer: order.retailer.name
      }
    }),
    details: {
      lineAllocations,
      totalShortages
    },
    tags: totalShortages > 0 ? ['allocation', 'shortage'] : ['allocation']
  });

  return {
    orderId,
    lineAllocations,
    totalShortages
  };
}

/**
 * Allocate inventory for a single line item (FIFO)
 */
async function allocateLineItem(
  lineItemId: string,
  productId: string,
  quantityOrdered: number
): Promise<AllocationResult['lineAllocations'][0]> {
  // Get available inventory for this product (FIFO by batch production date)
  const availableInventory = await prisma.inventoryItem.findMany({
    where: {
      productId,
      type: 'PRODUCT',
      status: InventoryStatus.AVAILABLE,
      quantityOnHand: { gt: 0 }
    },
    include: {
      batch: true
    },
    orderBy: {
      batch: {
        productionDate: 'asc'
      }
    }
  });

  let remainingToAllocate = quantityOrdered;
  const allocations: { inventoryId: string; batchId: string | null; quantity: number }[] = [];

  // Allocate FIFO
  for (const inventory of availableInventory) {
    if (remainingToAllocate <= 0) break;

    const availableQty = inventory.quantityOnHand - inventory.quantityReserved;
    if (availableQty <= 0) continue;

    const allocateQty = Math.min(availableQty, remainingToAllocate);

    // Reserve the quantity
    await prisma.inventoryItem.update({
      where: { id: inventory.id },
      data: {
        quantityReserved: {
          increment: allocateQty
        }
      }
    });

    allocations.push({
      inventoryId: inventory.id,
      batchId: inventory.batchId,
      quantity: allocateQty
    });

    remainingToAllocate -= allocateQty;
  }

  const quantityAllocated = quantityOrdered - remainingToAllocate;
  const shortageQuantity = remainingToAllocate;

  return {
    lineItemId,
    productId,
    quantityOrdered,
    quantityAllocated,
    shortageQuantity,
    allocations
  };
}

/**
 * Release allocations when order is cancelled
 */
export async function releaseAllocations(
  orderId: string,
  userId?: string
): Promise<void> {
  const order = await prisma.retailerOrder.findUnique({
    where: { id: orderId },
    include: {
      lineItems: true
    }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found');
  }

  // Release reservations for each line item
  for (const line of order.lineItems) {
    if (line.allocationDetails && Array.isArray(line.allocationDetails)) {
      for (const allocation of line.allocationDetails as any[]) {
        await prisma.inventoryItem.update({
          where: { id: allocation.inventoryId },
          data: {
            quantityReserved: {
              decrement: allocation.quantity
            }
          }
        });
      }
    }

    // Clear allocation details
    await prisma.orderLineItem.update({
      where: { id: line.id },
      data: {
        quantityAllocated: 0,
        shortageQuantity: 0,
        allocationDetails: null
      }
    });
  }

  // Log release
  await logAction({
    entityType: ActivityEntity.ORDER,
    entityId: orderId,
    action: 'allocations_released',
    userId,
    summary: `Allocations released for order ${order.orderNumber}`,
    details: { orderNumber: order.orderNumber }
  });
}

/**
 * Fulfill allocated inventory (reduce on-hand, clear reservation)
 */
export async function fulfillAllocations(
  orderId: string,
  userId?: string
): Promise<void> {
  const order = await prisma.retailerOrder.findUnique({
    where: { id: orderId },
    include: {
      lineItems: true
    }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found');
  }

  // Fulfill each line item allocation
  for (const line of order.lineItems) {
    if (line.allocationDetails && Array.isArray(line.allocationDetails)) {
      for (const allocation of line.allocationDetails as any[]) {
        const inventory = await prisma.inventoryItem.findUnique({
          where: { id: allocation.inventoryId }
        });

        if (!inventory) continue;

        // Reduce on-hand and reserved
        await prisma.inventoryItem.update({
          where: { id: allocation.inventoryId },
          data: {
            quantityOnHand: {
              decrement: allocation.quantity
            },
            quantityReserved: {
              decrement: allocation.quantity
            }
          }
        });

        // Log inventory change
        await logAction({
          entityType: ActivityEntity.ORDER,
          entityId: orderId,
          action: 'inventory_fulfilled',
          userId,
          summary: `Fulfilled ${allocation.quantity} units from inventory`,
          before: {
            quantityOnHand: inventory.quantityOnHand,
            quantityReserved: inventory.quantityReserved
          },
          after: {
            quantityOnHand: inventory.quantityOnHand - allocation.quantity,
            quantityReserved: inventory.quantityReserved - allocation.quantity
          },
          details: {
            inventoryId: allocation.inventoryId,
            quantity: allocation.quantity
          }
        });
      }
    }
  }

  // Log fulfillment
  await logAction({
    entityType: ActivityEntity.ORDER,
    entityId: orderId,
    action: 'fulfilled',
    userId,
    summary: `Order ${order.orderNumber} fulfilled`,
    details: { orderNumber: order.orderNumber }
  });
}


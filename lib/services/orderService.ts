// ORDER SERVICE - Retailer order management
// ALL business logic for order workflows

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction, generateSummary } from './loggingService';
import { allocateOrder, releaseAllocations, fulfillAllocations } from './allocationService';
import { createProductionOrdersForShortages, createPurchaseOrdersForMaterialShortages, checkMaterialRequirements } from './mrpService';
import { ActivityEntity, OrderStatus } from '@prisma/client';
import { generateOrderNumber } from '@/lib/utils/formatters';

export interface CreateOrderParams {
  retailerId: string;
  createdByUserId: string;
  requestedShipDate?: Date;
  lineItems: {
    productId: string;
    quantityOrdered: number;
  }[];
}

/**
 * Create a new retailer order
 */
export async function createOrder(params: CreateOrderParams): Promise<string> {
  const { retailerId, createdByUserId, requestedShipDate, lineItems } = params;

  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId }
  });

  if (!retailer) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Retailer not found');
  }

  if (lineItems.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'At least one line item is required');
  }

  const order = await prisma.retailerOrder.create({
    data: {
      orderNumber: generateOrderNumber('ORD'),
      retailerId,
      createdByUserId,
      requestedShipDate,
      status: OrderStatus.DRAFT,
      lineItems: {
        create: lineItems.map(item => ({
          productId: item.productId,
          quantityOrdered: item.quantityOrdered
        }))
      }
    },
    include: {
      retailer: true,
      createdBy: true,
      lineItems: {
        include: {
          product: true
        }
      }
    }
  });

  await logAction({
    entityType: ActivityEntity.ORDER,
    entityId: order.id,
    action: 'created',
    userId: createdByUserId,
    summary: generateSummary({
      userName: order.createdBy.name,
      action: 'created',
      entityName: `order ${order.orderNumber}`,
      details: {
        retailer: retailer.name
      }
    }),
    details: {
      retailerName: retailer.name,
      lineItems: order.lineItems.map(li => ({
        productName: li.product.name,
        quantity: li.quantityOrdered
      }))
    },
    tags: ['created']
  });

  return order.id;
}

/**
 * Submit order - triggers allocation and shortage handling
 */
export async function submitOrder(orderId: string, userId: string): Promise<{
  allocated: boolean;
  shortages: Array<{ productId: string; productName: string; shortage: number }>;
  productionOrdersCreated: string[];
  purchaseOrdersCreated: string[];
}> {
  const order = await prisma.retailerOrder.findUnique({
    where: { id: orderId },
    include: {
      lineItems: {
        include: {
          product: true
        }
      },
      retailer: true
    }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found');
  }

  if (order.status !== OrderStatus.DRAFT) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Only draft orders can be submitted'
    );
  }

  // Update status to SUBMITTED
  await prisma.retailerOrder.update({
    where: { id: orderId },
    data: { status: OrderStatus.SUBMITTED }
  });

  // Allocate inventory
  const allocationResult = await allocateOrder(orderId, userId);

  const shortages: Array<{ productId: string; productName: string; shortage: number }> = [];
  const productionOrderShortages: Array<{ productId: string; quantity: number; linkedOrderIds: string[] }> = [];

  // Collect shortages
  for (const lineAlloc of allocationResult.lineAllocations) {
    if (lineAlloc.shortageQuantity > 0) {
      const product = order.lineItems.find(li => li.productId === lineAlloc.productId)?.product;
      
      shortages.push({
        productId: lineAlloc.productId,
        productName: product?.name || 'Unknown',
        shortage: lineAlloc.shortageQuantity
      });

      productionOrderShortages.push({
        productId: lineAlloc.productId,
        quantity: lineAlloc.shortageQuantity,
        linkedOrderIds: [orderId]
      });
    }
  }

  let productionOrdersCreated: string[] = [];
  let purchaseOrdersCreated: string[] = [];

  // Handle shortages if any
  if (productionOrderShortages.length > 0) {
    // Create production orders for product shortages
    productionOrdersCreated = await createProductionOrdersForShortages(
      productionOrderShortages,
      userId
    );

    // Check material requirements for each production order
    const materialShortages: Array<{ materialId: string; quantity: number }> = [];

    for (const shortage of productionOrderShortages) {
      const matReqs = await checkMaterialRequirements(
        shortage.productId,
        shortage.quantity
      );

      for (const req of matReqs) {
        if (req.quantityShortage > 0) {
          // Aggregate material shortages
          const existing = materialShortages.find(ms => ms.materialId === req.materialId);
          if (existing) {
            existing.quantity += req.quantityShortage;
          } else {
            materialShortages.push({
              materialId: req.materialId,
              quantity: req.quantityShortage
            });
          }
        }
      }
    }

    // Create purchase orders for material shortages
    if (materialShortages.length > 0) {
      purchaseOrdersCreated = await createPurchaseOrdersForMaterialShortages(
        materialShortages,
        userId
      );
    }
  }

  await logAction({
    entityType: ActivityEntity.ORDER,
    entityId: orderId,
    action: 'submitted',
    userId,
    summary: generateSummary({
      userName: 'User',
      action: 'submitted',
      entityName: `order ${order.orderNumber}`,
      details: {
        shortages: shortages.length
      }
    }),
    details: {
      shortages,
      productionOrdersCreated: productionOrdersCreated.length,
      purchaseOrdersCreated: purchaseOrdersCreated.length
    },
    tags: shortages.length > 0 ? ['submitted', 'shortage'] : ['submitted']
  });

  return {
    allocated: allocationResult.totalShortages === 0,
    shortages,
    productionOrdersCreated,
    purchaseOrdersCreated
  };
}

/**
 * Approve order
 */
export async function approveOrder(orderId: string, userId: string): Promise<void> {
  const order = await prisma.retailerOrder.findUnique({
    where: { id: orderId }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found');
  }

  if (order.status !== OrderStatus.SUBMITTED) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Only submitted orders can be approved'
    );
  }

  await prisma.retailerOrder.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.APPROVED,
      approvedByUserId: userId,
      approvedAt: new Date()
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.ORDER,
    entityId: orderId,
    action: 'approved',
    userId,
    summary: generateSummary({
      userName: user?.name || 'User',
      action: 'approved',
      entityName: `order ${order.orderNumber}`
    }),
    before: { status: order.status },
    after: { status: OrderStatus.APPROVED }
  });
}

/**
 * Ship order
 */
export async function shipOrder(params: {
  orderId: string;
  trackingNumber?: string;
  userId: string;
}): Promise<void> {
  const { orderId, trackingNumber, userId } = params;

  const order = await prisma.retailerOrder.findUnique({
    where: { id: orderId }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found');
  }

  if (order.status !== OrderStatus.APPROVED && order.status !== OrderStatus.IN_FULFILLMENT) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Only approved or in-fulfillment orders can be shipped'
    );
  }

  // Fulfill allocations (reduce inventory)
  await fulfillAllocations(orderId, userId);

  await prisma.retailerOrder.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.SHIPPED,
      shippedAt: new Date(),
      trackingNumber
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.ORDER,
    entityId: orderId,
    action: 'shipped',
    userId,
    summary: generateSummary({
      userName: user?.name || 'User',
      action: 'shipped',
      entityName: `order ${order.orderNumber}`,
      details: {
        trackingNumber
      }
    }),
    before: { status: order.status },
    after: { status: OrderStatus.SHIPPED, trackingNumber },
    details: {
      trackingNumber
    }
  });
}

/**
 * Cancel order
 */
export async function cancelOrder(orderId: string, userId: string): Promise<void> {
  const order = await prisma.retailerOrder.findUnique({
    where: { id: orderId }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found');
  }

  if (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.CANCELLED) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Cannot cancel shipped or already cancelled orders'
    );
  }

  // Release any allocations
  if (order.status !== OrderStatus.DRAFT) {
    await releaseAllocations(orderId, userId);
  }

  await prisma.retailerOrder.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.CANCELLED
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.ORDER,
    entityId: orderId,
    action: 'cancelled',
    userId,
    summary: generateSummary({
      userName: user?.name || 'User',
      action: 'cancelled',
      entityName: `order ${order.orderNumber}`
    }),
    before: { status: order.status },
    after: { status: OrderStatus.CANCELLED }
  });
}


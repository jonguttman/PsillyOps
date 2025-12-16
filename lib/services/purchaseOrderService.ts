// PURCHASE ORDER SERVICE
// Handles PO lifecycle: create, submit, receive (append-only), and queries

import { prisma } from '@/lib/db/prisma';
import { PurchaseOrderStatus, ActivityEntity } from '@prisma/client';
import { logAction, generateSummary } from './loggingService';
import { receiveMaterials } from './inventoryService';
import { AppError, ErrorCodes } from '@/lib/utils/errors';

// ========================================
// TYPES
// ========================================

export interface CreatePurchaseOrderInput {
  vendorId: string;
  expectedDeliveryDate?: Date;
  notes?: string;
  lineItems: {
    materialId: string;
    quantityOrdered: number;
    unitCost?: number;
  }[];
}

export interface UpdatePurchaseOrderInput {
  expectedDeliveryDate?: Date;
  notes?: string;
  lineItems?: {
    id?: string; // existing line item ID, or undefined for new
    materialId: string;
    quantityOrdered: number;
    unitCost?: number;
  }[];
}

export interface ReceiveItemInput {
  lineItemId: string;
  quantityReceived: number;
  lotNumber?: string;
  expiryDate?: Date;
}

export interface PurchaseOrderFilters {
  status?: PurchaseOrderStatus;
  vendorId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// ========================================
// PO NUMBER GENERATION
// ========================================

async function generatePONumber(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  
  // Count POs this month to get sequence number
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  
  const count = await prisma.purchaseOrder.count({
    where: {
      createdAt: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    },
  });
  
  const sequence = (count + 1).toString().padStart(3, '0');
  return `PO-${year}${month}-${sequence}`;
}

// ========================================
// CREATE
// ========================================

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  userId: string
): Promise<string> {
  // Validate vendor exists
  const vendor = await prisma.vendor.findUnique({
    where: { id: input.vendorId },
  });
  
  if (!vendor) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Vendor not found');
  }
  
  // Validate all materials exist
  for (const item of input.lineItems) {
    const material = await prisma.rawMaterial.findUnique({
      where: { id: item.materialId },
    });
    if (!material) {
      throw new AppError(ErrorCodes.NOT_FOUND, `Material not found: ${item.materialId}`);
    }
  }
  
  const poNumber = await generatePONumber();
  
  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      vendorId: input.vendorId,
      status: PurchaseOrderStatus.DRAFT,
      createdByUserId: userId,
      expectedDeliveryDate: input.expectedDeliveryDate,
      lineItems: {
        create: input.lineItems.map((item) => ({
          materialId: item.materialId,
          quantityOrdered: item.quantityOrdered,
          unitCost: item.unitCost,
        })),
      },
    },
    include: {
      vendor: true,
      lineItems: {
        include: { material: true },
      },
    },
  });
  
  // Log creation
  await logAction({
    entityType: ActivityEntity.PURCHASE_ORDER,
    entityId: purchaseOrder.id,
    action: 'created',
    userId,
    summary: generateSummary({
      action: 'created',
      entityName: `purchase order ${poNumber}`,
      metadata: { vendor: vendor.name, itemCount: input.lineItems.length },
    }),
    metadata: {
      poNumber,
      vendorId: input.vendorId,
      vendorName: vendor.name,
      lineItems: purchaseOrder.lineItems.map((li) => ({
        materialName: li.material.name,
        quantity: li.quantityOrdered,
        unitCost: li.unitCost,
      })),
    },
    tags: ['created'],
  });
  
  return purchaseOrder.id;
}

// ========================================
// UPDATE (DRAFT only)
// ========================================

export async function updatePurchaseOrder(
  id: string,
  input: UpdatePurchaseOrderInput,
  userId: string
): Promise<void> {
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      lineItems: { include: { material: true } },
    },
  });
  
  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Purchase order not found');
  }
  
  if (existing.status !== PurchaseOrderStatus.DRAFT) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Can only edit purchase orders in DRAFT status'
    );
  }
  
  // Capture before state for diff
  const before = {
    expectedDeliveryDate: existing.expectedDeliveryDate?.toISOString(),
    lineItemCount: existing.lineItems.length,
  };
  
  // Update PO fields
  await prisma.purchaseOrder.update({
    where: { id },
    data: {
      expectedDeliveryDate: input.expectedDeliveryDate,
    },
  });
  
  // Handle line items if provided
  if (input.lineItems) {
    // Delete existing line items and recreate
    await prisma.purchaseOrderLineItem.deleteMany({
      where: { purchaseOrderId: id },
    });
    
    await prisma.purchaseOrderLineItem.createMany({
      data: input.lineItems.map((item) => ({
        purchaseOrderId: id,
        materialId: item.materialId,
        quantityOrdered: item.quantityOrdered,
        unitCost: item.unitCost,
      })),
    });
  }
  
  const after = {
    expectedDeliveryDate: input.expectedDeliveryDate?.toISOString(),
    lineItemCount: input.lineItems?.length ?? before.lineItemCount,
  };
  
  // Log update
  await logAction({
    entityType: ActivityEntity.PURCHASE_ORDER,
    entityId: id,
    action: 'updated',
    userId,
    summary: generateSummary({
      action: 'updated',
      entityName: `purchase order ${existing.poNumber}`,
    }),
    before,
    after,
    tags: ['updated'],
  });
}

// ========================================
// SUBMIT (DRAFT → SENT)
// ========================================

export async function submitPurchaseOrder(
  id: string,
  userId: string
): Promise<void> {
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { vendor: true, lineItems: true },
  });
  
  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Purchase order not found');
  }
  
  if (existing.status !== PurchaseOrderStatus.DRAFT) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Can only submit purchase orders in DRAFT status'
    );
  }
  
  if (existing.lineItems.length === 0) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Cannot submit a purchase order with no line items'
    );
  }
  
  await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: PurchaseOrderStatus.SENT,
      sentAt: new Date(),
    },
  });
  
  // Log submission
  await logAction({
    entityType: ActivityEntity.PURCHASE_ORDER,
    entityId: id,
    action: 'submitted',
    userId,
    summary: generateSummary({
      action: 'submitted',
      entityName: `purchase order ${existing.poNumber}`,
      metadata: { vendor: existing.vendor.name },
    }),
    before: { status: PurchaseOrderStatus.DRAFT },
    after: { status: PurchaseOrderStatus.SENT },
    tags: ['status_change'],
  });
}

// ========================================
// RECEIVE (Append-only)
// ========================================

export async function receivePurchaseOrderItems(
  poId: string,
  items: ReceiveItemInput[],
  locationId: string,
  userId: string
): Promise<void> {
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      vendor: true,
      lineItems: {
        include: { material: true },
      },
    },
  });
  
  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Purchase order not found');
  }
  
  // Validate status - can only receive on SENT or PARTIALLY_RECEIVED
  if (
    existing.status !== PurchaseOrderStatus.SENT &&
    existing.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
  ) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `Cannot receive items on a ${existing.status} purchase order`
    );
  }
  
  // Build a map of line items for quick lookup
  const lineItemMap = new Map(
    existing.lineItems.map((li) => [li.id, li])
  );
  
  // Validate all receive items
  for (const item of items) {
    const lineItem = lineItemMap.get(item.lineItemId);
    if (!lineItem) {
      throw new AppError(
        ErrorCodes.NOT_FOUND,
        `Line item not found: ${item.lineItemId}`
      );
    }
    
    const remainingToReceive = lineItem.quantityOrdered - lineItem.quantityReceived;
    if (item.quantityReceived > remainingToReceive) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Cannot receive ${item.quantityReceived} of ${lineItem.material.name}. Only ${remainingToReceive} remaining.`
      );
    }
    
    if (item.quantityReceived <= 0) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Quantity received must be greater than 0'
      );
    }
  }
  
  // Process each receipt
  const receiptDetails: any[] = [];
  
  for (const item of items) {
    const lineItem = lineItemMap.get(item.lineItemId)!;
    
    // Update line item quantity received
    await prisma.purchaseOrderLineItem.update({
      where: { id: item.lineItemId },
      data: {
        quantityReceived: lineItem.quantityReceived + item.quantityReceived,
        lotNumber: item.lotNumber || lineItem.lotNumber,
        expiryDate: item.expiryDate || lineItem.expiryDate,
      },
    });
    
    // Create inventory record
    await receiveMaterials({
      materialId: lineItem.materialId,
      quantity: item.quantityReceived,
      locationId,
      lotNumber: item.lotNumber,
      expiryDate: item.expiryDate,
      userId,
      unitCost: lineItem.unitCost || undefined,
      purchaseOrderId: poId,
    });
    
    receiptDetails.push({
      materialId: lineItem.materialId,
      materialName: lineItem.material.name,
      quantityReceived: item.quantityReceived,
      lotNumber: item.lotNumber,
      expiryDate: item.expiryDate?.toISOString(),
    });
  }
  
  // Determine new status
  const updatedLineItems = await prisma.purchaseOrderLineItem.findMany({
    where: { purchaseOrderId: poId },
  });
  
  const allFullyReceived = updatedLineItems.every(
    (li) => li.quantityReceived >= li.quantityOrdered
  );
  
  const newStatus = allFullyReceived
    ? PurchaseOrderStatus.RECEIVED
    : PurchaseOrderStatus.PARTIALLY_RECEIVED;
  
  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: {
      status: newStatus,
      receivedAt: allFullyReceived ? new Date() : undefined,
    },
  });
  
  // Log receipt (append-only event)
  await logAction({
    entityType: ActivityEntity.PURCHASE_ORDER,
    entityId: poId,
    action: 'received',
    userId,
    summary: generateSummary({
      action: 'received',
      entityName: `${items.length} item(s) from ${existing.poNumber}`,
      metadata: { vendor: existing.vendor.name },
    }),
    metadata: {
      poNumber: existing.poNumber,
      vendorName: existing.vendor.name,
      receipts: receiptDetails,
      newStatus,
    },
    before: { status: existing.status },
    after: { status: newStatus },
    tags: ['received', 'inventory', allFullyReceived ? 'completed' : 'partial'],
  });
}

// ========================================
// CANCEL
// ========================================

export async function cancelPurchaseOrder(
  id: string,
  reason: string,
  userId: string
): Promise<void> {
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { vendor: true },
  });
  
  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Purchase order not found');
  }
  
  // Can cancel DRAFT or SENT
  if (
    existing.status !== PurchaseOrderStatus.DRAFT &&
    existing.status !== PurchaseOrderStatus.SENT
  ) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Can only cancel purchase orders in DRAFT or SENT status'
    );
  }
  
  await prisma.purchaseOrder.update({
    where: { id },
    data: { status: PurchaseOrderStatus.CANCELLED },
  });
  
  await logAction({
    entityType: ActivityEntity.PURCHASE_ORDER,
    entityId: id,
    action: 'cancelled',
    userId,
    summary: generateSummary({
      action: 'cancelled',
      entityName: `purchase order ${existing.poNumber}`,
      metadata: { reason },
    }),
    before: { status: existing.status },
    after: { status: PurchaseOrderStatus.CANCELLED },
    metadata: { reason },
    tags: ['status_change', 'cancelled'],
  });
}

// ========================================
// QUERIES
// ========================================

export async function getPurchaseOrder(id: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      lineItems: {
        include: {
          material: {
            select: { id: true, name: true, sku: true, unitOfMeasure: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  
  return po;
}

export async function listPurchaseOrders(filters: PurchaseOrderFilters = {}) {
  const where: any = {};
  
  if (filters.status) {
    where.status = filters.status;
  }
  
  if (filters.vendorId) {
    where.vendorId = filters.vendorId;
  }
  
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }
  
  const [purchaseOrders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        lineItems: {
          select: {
            id: true,
            quantityOrdered: true,
            quantityReceived: true,
            unitCost: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  
  return { purchaseOrders, total };
}

export async function getPurchaseOrdersCount(filters: Omit<PurchaseOrderFilters, 'limit' | 'offset'> = {}) {
  const where: any = {};
  
  if (filters.status) where.status = filters.status;
  if (filters.vendorId) where.vendorId = filters.vendorId;
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }
  
  return prisma.purchaseOrder.count({ where });
}

// ========================================
// HELPERS
// ========================================

export function calculatePOTotal(
  lineItems: { quantityOrdered: number; unitCost: number | null }[]
): number {
  return lineItems.reduce((sum, item) => {
    return sum + item.quantityOrdered * (item.unitCost || 0);
  }, 0);
}

export function getPOStatusColor(status: PurchaseOrderStatus): string {
  const colors: Record<PurchaseOrderStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    SENT: 'bg-blue-100 text-blue-700',
    PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-700',
    RECEIVED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };
  return colors[status];
}


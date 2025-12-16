// INVENTORY ADJUSTMENT SERVICE - Single source of truth for inventory quantity changes
// CRITICAL: Do not mutate inventory quantity without recording an adjustment row.

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity, InventoryAdjustmentType, MovementType, InventoryType } from '@prisma/client';

export interface CreateInventoryAdjustmentParams {
  inventoryId: string;
  deltaQty: number; // integer (+ / -), cannot be 0
  reason: string;
  adjustmentType: InventoryAdjustmentType;
  relatedEntityType?: ActivityEntity;
  relatedEntityId?: string;
  userId?: string;
}

export type InventoryAdjustmentTypeInput =
  | 'PRODUCTION_COMPLETE'
  | 'PRODUCTION_SCRAP'
  | 'MANUAL_CORRECTION'
  | 'RECEIVING'
  | 'CONSUMPTION';

function adjustmentTypeTag(t: InventoryAdjustmentType): string {
  switch (t) {
    case InventoryAdjustmentType.PRODUCTION_COMPLETE:
      return 'production_complete';
    case InventoryAdjustmentType.PRODUCTION_SCRAP:
      return 'production_scrap';
    case InventoryAdjustmentType.MANUAL_CORRECTION:
      return 'manual_correction';
    case InventoryAdjustmentType.RECEIVING:
      return 'receiving';
    case InventoryAdjustmentType.CONSUMPTION:
      return 'consumption';
    default:
      return 'adjustment';
  }
}

function movementTypeForAdjustment(t: InventoryAdjustmentType): MovementType {
  switch (t) {
    case InventoryAdjustmentType.PRODUCTION_COMPLETE:
      return MovementType.PRODUCE;
    case InventoryAdjustmentType.RECEIVING:
      return MovementType.RECEIVE;
    case InventoryAdjustmentType.CONSUMPTION:
      return MovementType.CONSUME;
    case InventoryAdjustmentType.PRODUCTION_SCRAP:
    case InventoryAdjustmentType.MANUAL_CORRECTION:
    default:
      return MovementType.ADJUST;
  }
}

export async function createInventoryAdjustment(params: CreateInventoryAdjustmentParams) {
  const {
    inventoryId,
    deltaQty,
    reason,
    adjustmentType,
    relatedEntityType,
    relatedEntityId,
    userId,
  } = params;

  if (!Number.isInteger(deltaQty)) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 'deltaQty must be an integer');
  }
  if (deltaQty === 0) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 'deltaQty cannot be 0');
  }
  if (!reason || reason.trim().length === 0) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 'reason is required');
  }

  return prisma.$transaction(async (tx) => {
    const inventory = await tx.inventoryItem.findUnique({
      where: { id: inventoryId },
      include: {
        product: { select: { id: true, name: true } },
        material: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (!inventory) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Inventory item not found');
    }

    const beforeQty = inventory.quantityOnHand;
    const afterQty = beforeQty + deltaQty;
    if (afterQty < 0) {
      throw new AppError(
        ErrorCodes.INVALID_OPERATION,
        `Adjustment would result in negative on-hand quantity (${afterQty}).`
      );
    }
    if (afterQty < inventory.quantityReserved) {
      throw new AppError(
        ErrorCodes.INVALID_OPERATION,
        `Adjustment would result in on-hand below reserved quantity (${inventory.quantityReserved}).`
      );
    }

    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        inventoryId,
        deltaQty,
        reason,
        adjustmentType,
        relatedEntityType: relatedEntityType || null,
        relatedEntityId: relatedEntityId || null,
        createdById: userId || null,
      },
    });

    // Keep RawMaterial.currentStockQty in sync for material inventory items
    if (inventory.type === InventoryType.MATERIAL && inventory.materialId) {
      await tx.rawMaterial.update({
        where: { id: inventory.materialId },
        data: {
          currentStockQty: { increment: deltaQty },
        },
      });
    }

    const updated = await tx.inventoryItem.update({
      where: { id: inventoryId },
      data: { quantityOnHand: afterQty },
      select: { id: true, quantityOnHand: true },
    });

    // Create movement record for audit trail continuity
    await tx.inventoryMovement.create({
      data: {
        inventoryId,
        materialId: inventory.materialId || null,
        productId: inventory.productId || null,
        batchId: inventory.batchId || null,
        type: movementTypeForAdjustment(adjustmentType),
        quantity: deltaQty,
        fromLocation: inventory.location.name,
        toLocation: inventory.location.name,
        reason,
        reference: relatedEntityId || null,
        userId: userId || null,
      },
    });

    const sign = deltaQty > 0 ? '+' : '';
    const typeLabel = adjustmentType.replaceAll('_', ' ').toLowerCase();
    const summary = `Inventory adjusted ${sign}${deltaQty} units (${typeLabel})`;

    const name = inventory.product?.name || inventory.material?.name || 'Inventory item';
    const typeTag = adjustmentTypeTag(adjustmentType);

    // Note: logAction writes outside this tx via the shared prisma client.
    // That’s intentional: we never mutate inventory without an adjustment row (tx),
    // and we also persist an auditable ActivityLog entry for narrative UI.
    await logAction({
      entityType: ActivityEntity.INVENTORY,
      entityId: inventoryId,
      action: 'inventory_adjusted',
      userId,
      summary,
      before: { quantityOnHand: beforeQty },
      after: { quantityOnHand: afterQty },
      metadata: {
        inventoryId,
        itemName: name,
        deltaQty,
        beforeQty,
        afterQty,
        reason,
        adjustmentType,
        relatedEntityType,
        relatedEntityId,
        adjustmentId: adjustment.id,
      },
      tags: ['inventory', 'adjustment', 'quantity_change', typeTag],
    });

    return {
      adjustment,
      inventory: updated,
    };
  });
}

export async function getInventoryAdjustments(inventoryId: string) {
  const inventory = await prisma.inventoryItem.findUnique({
    where: { id: inventoryId },
    select: { id: true },
  });
  if (!inventory) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Inventory item not found');
  }

  const adjustments = await prisma.inventoryAdjustment.findMany({
    where: { inventoryId },
    include: {
      createdBy: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return { adjustments };
}

/**
 * Get recent inventory adjustments (default: last 48h).
 * Read-only helper for dashboard accountability visibility.
 */
export async function getRecentAdjustments(params?: {
  hours?: number;
  adjustmentType?: InventoryAdjustmentTypeInput;
}) {
  const hours = params?.hours ?? 48;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const adjustments = await prisma.inventoryAdjustment.findMany({
    where: {
      createdAt: { gte: since },
      ...(params?.adjustmentType
        ? { adjustmentType: params.adjustmentType as unknown as InventoryAdjustmentType }
        : {}),
    },
    include: {
      inventory: {
        select: {
          id: true,
          type: true,
          product: { select: { id: true, name: true } },
          material: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          quantityOnHand: true,
          unitOfMeasure: true,
        },
      },
      createdBy: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return { adjustments, since };
}


/**
 * API Route: Receive Inventory
 * 
 * Handles inventory receiving, with optional PO line linking.
 * Updates material stock and PO line received quantities.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { PurchaseOrderStatus } from '@prisma/client';

interface ReceiveRequest {
  materialId: string;
  quantity: number;
  poLineId?: string;
  lotNumber?: string;
  expiryDate?: string;
  notes?: string;
}

/**
 * POST /api/inventory/receive
 * 
 * Receive inventory for a material
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Check permission
    if (!hasPermission(session.user.role, 'inventory', 'adjust')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body: ReceiveRequest = await req.json();
    const { materialId, quantity, poLineId, lotNumber, expiryDate, notes } = body;

    // Validate required fields
    if (!materialId || typeof quantity !== 'number' || quantity <= 0) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'materialId and positive quantity are required' },
        { status: 400 }
      );
    }

    // Fetch material
    const material = await prisma.rawMaterial.findUnique({
      where: { id: materialId },
      select: { id: true, name: true, sku: true, currentStockQty: true, unitOfMeasure: true },
    });

    if (!material) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Material not found' },
        { status: 404 }
      );
    }

    // If PO line specified, validate and update
    let poLine = null;
    let purchaseOrder = null;
    if (poLineId) {
      poLine = await prisma.purchaseOrderLineItem.findUnique({
        where: { id: poLineId },
        include: {
          purchaseOrder: {
            select: { id: true, poNumber: true, status: true },
          },
        },
      });

      if (!poLine) {
        return Response.json(
          { code: 'NOT_FOUND', message: 'Purchase order line not found' },
          { status: 404 }
        );
      }

      if (poLine.materialId !== materialId) {
        return Response.json(
          { code: 'VALIDATION_ERROR', message: 'PO line does not match material' },
          { status: 400 }
        );
      }

      const remaining = poLine.quantityOrdered - poLine.quantityReceived;
      if (quantity > remaining) {
        return Response.json(
          { code: 'VALIDATION_ERROR', message: `Cannot receive more than remaining quantity (${remaining})` },
          { status: 400 }
        );
      }

      purchaseOrder = poLine.purchaseOrder;
    }

    // Perform the receiving in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update material stock
      const updatedMaterial = await tx.rawMaterial.update({
        where: { id: materialId },
        data: {
          currentStockQty: { increment: quantity },
        },
        select: { currentStockQty: true },
      });

      // Update PO line if applicable
      if (poLine && purchaseOrder) {
        await tx.purchaseOrderLineItem.update({
          where: { id: poLineId },
          data: {
            quantityReceived: { increment: quantity },
          },
        });

        // Check if PO is fully received
        const allLines = await tx.purchaseOrderLineItem.findMany({
          where: { purchaseOrderId: purchaseOrder.id },
          select: { quantityOrdered: true, quantityReceived: true },
        });

        // After updating, recalculate
        const updatedLines = allLines.map(line => {
          if (line === poLine) {
            return { ...line, quantityReceived: line.quantityReceived + quantity };
          }
          return line;
        });

        const allFullyReceived = updatedLines.every(
          line => line.quantityReceived >= line.quantityOrdered
        );
        const anyReceived = updatedLines.some(line => line.quantityReceived > 0);

        let newStatus = purchaseOrder.status;
        if (allFullyReceived) {
          newStatus = PurchaseOrderStatus.RECEIVED;
        } else if (anyReceived) {
          newStatus = PurchaseOrderStatus.PARTIALLY_RECEIVED;
        }

        if (newStatus !== purchaseOrder.status) {
          await tx.purchaseOrder.update({
            where: { id: purchaseOrder.id },
            data: { status: newStatus },
          });
        }
      }

      // Log the activity
      await tx.activityLog.create({
        data: {
          action: 'INVENTORY_RECEIVED',
          entityType: 'MATERIAL',
          entityId: materialId,
          userId: session.user.id,
          summary: `Received ${quantity} ${material.unitOfMeasure} of ${material.name}`,
          metadata: {
            materialName: material.name,
            materialSku: material.sku,
            quantity,
            unitOfMeasure: material.unitOfMeasure,
            poNumber: purchaseOrder?.poNumber,
            poLineId,
            lotNumber,
            notes,
            previousStock: material.currentStockQty,
            newStock: updatedMaterial.currentStockQty,
          },
        },
      });

      return {
        newStockLevel: updatedMaterial.currentStockQty,
      };
    });

    return Response.json({
      ok: true,
      message: 'Inventory received successfully',
      ...result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}


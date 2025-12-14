// API Route: Inventory Adjustment (per inventory item)
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { createInventoryAdjustment } from '@/lib/services/inventoryAdjustmentService';
import { createInventoryAdjustmentSchema } from '@/lib/utils/validators';
import { ActivityEntity, InventoryAdjustmentType } from '@prisma/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Validate
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // "OPS" maps to the existing warehouse/ops role
    if (!hasPermission(session.user.role, 'inventory', 'adjust')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id: inventoryId } = await params;
    const body = await req.json();
    const validated = createInventoryAdjustmentSchema.parse(body);

    // Map UI-only relatedEntityType "QR_TOKEN" onto ActivityEntity.SYSTEM
    const relatedEntityType =
      validated.relatedEntityType === 'QR_TOKEN'
        ? ActivityEntity.SYSTEM
        : (validated.relatedEntityType as ActivityEntity | undefined);

    // 2. Call Service
    const result = await createInventoryAdjustment({
      inventoryId,
      deltaQty: validated.deltaQty,
      reason: validated.reason,
      adjustmentType: validated.adjustmentType as InventoryAdjustmentType,
      relatedEntityType,
      relatedEntityId: validated.relatedEntityId,
      userId: session.user.id,
    });

    // 3. Return JSON
    return Response.json({
      success: true,
      adjustment: result.adjustment,
      inventory: result.inventory,
    });
  } catch (error) {
    return handleApiError(error);
  }
}


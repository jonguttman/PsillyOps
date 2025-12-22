// API Route: Purchase Order Detail - Get & Update
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getPurchaseOrder, updatePurchaseOrder, cancelPurchaseOrder } from '@/lib/services/purchaseOrderService';
import { handleApiError } from '@/lib/utils/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/purchase-orders/[id] - Get purchase order detail
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const purchaseOrder = await getPurchaseOrder(id);

    if (!purchaseOrder) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Purchase order not found' },
        { status: 404 }
      );
    }

    return Response.json(purchaseOrder);
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/purchase-orders/[id] - Update purchase order (DRAFT only)
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN and WAREHOUSE can update POs
    if (!['ADMIN', 'WAREHOUSE'].includes(session.user.role)) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    await updatePurchaseOrder(
      id,
      {
        expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : undefined,
        notes: body.notes,
        lineItems: body.lineItems?.map((item: any) => ({
          id: item.id,
          materialId: item.materialId,
          quantityOrdered: Number(item.quantityOrdered),
          unitCost: item.unitCost ? Number(item.unitCost) : undefined,
        })),
      },
      session.user.id
    );

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/purchase-orders/[id] - Cancel purchase order
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN can cancel POs
    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const reason = searchParams.get('reason') || 'Cancelled by user';

    await cancelPurchaseOrder(id, reason, session.user.id);

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}







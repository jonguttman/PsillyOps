// API Route: Receive Purchase Order Items
// STRICT LAYERING: Validate → Call Service → Return JSON
// Append-only receiving - each receipt is an event, not a mutation

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { receivePurchaseOrderItems } from '@/lib/services/purchaseOrderService';
import { handleApiError } from '@/lib/utils/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/purchase-orders/[id]/receive - Receive items on a PO
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN and WAREHOUSE can receive POs
    if (!['ADMIN', 'WAREHOUSE'].includes(session.user.role)) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    // Validate required fields
    if (!body.locationId) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Location is required for receiving' },
        { status: 400 }
      );
    }

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'At least one item to receive is required' },
        { status: 400 }
      );
    }

    // Validate each item
    for (const item of body.items) {
      if (!item.lineItemId) {
        return Response.json(
          { code: 'VALIDATION_ERROR', message: 'Each item must have a lineItemId' },
          { status: 400 }
        );
      }
      if (!item.quantityReceived || item.quantityReceived <= 0) {
        return Response.json(
          { code: 'VALIDATION_ERROR', message: 'Each item must have a positive quantity' },
          { status: 400 }
        );
      }
    }

    await receivePurchaseOrderItems(
      id,
      body.items.map((item: any) => ({
        lineItemId: item.lineItemId,
        quantityReceived: Number(item.quantityReceived),
        lotNumber: item.lotNumber,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
      })),
      body.locationId,
      session.user.id
    );

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}






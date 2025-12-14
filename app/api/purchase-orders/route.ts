// API Route: Purchase Orders - List & Create
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { listPurchaseOrders, createPurchaseOrder } from '@/lib/services/purchaseOrderService';
import { handleApiError } from '@/lib/utils/errors';
import { PurchaseOrderStatus } from '@prisma/client';

// GET /api/purchase-orders - List purchase orders
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    
    const filters: {
      status?: PurchaseOrderStatus;
      vendorId?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {};

    if (searchParams.get('status')) {
      filters.status = searchParams.get('status') as PurchaseOrderStatus;
    }
    if (searchParams.get('vendorId')) {
      filters.vendorId = searchParams.get('vendorId');
    }
    if (searchParams.get('startDate')) {
      filters.startDate = new Date(searchParams.get('startDate')!);
    }
    if (searchParams.get('endDate')) {
      filters.endDate = new Date(searchParams.get('endDate')!);
    }
    if (searchParams.get('limit')) {
      filters.limit = parseInt(searchParams.get('limit')!);
    }
    if (searchParams.get('offset')) {
      filters.offset = parseInt(searchParams.get('offset')!);
    }

    const { purchaseOrders, total } = await listPurchaseOrders(filters);

    return Response.json({
      purchaseOrders,
      total,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/purchase-orders - Create purchase order
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN and WAREHOUSE can create POs
    if (!['ADMIN', 'WAREHOUSE'].includes(session.user.role)) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Validate required fields
    if (!body.vendorId) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Vendor is required' },
        { status: 400 }
      );
    }

    if (!body.lineItems || !Array.isArray(body.lineItems) || body.lineItems.length === 0) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'At least one line item is required' },
        { status: 400 }
      );
    }

    // Validate line items
    for (const item of body.lineItems) {
      if (!item.materialId || !item.quantityOrdered || item.quantityOrdered <= 0) {
        return Response.json(
          { code: 'VALIDATION_ERROR', message: 'Each line item must have a material and positive quantity' },
          { status: 400 }
        );
      }
    }

    const poId = await createPurchaseOrder(
      {
        vendorId: body.vendorId,
        expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : undefined,
        notes: body.notes,
        lineItems: body.lineItems.map((item: any) => ({
          materialId: item.materialId,
          quantityOrdered: Number(item.quantityOrdered),
          unitCost: item.unitCost ? Number(item.unitCost) : undefined,
        })),
      },
      session.user.id
    );

    return Response.json({ id: poId }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}


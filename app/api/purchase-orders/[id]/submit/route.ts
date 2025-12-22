// API Route: Submit Purchase Order (DRAFT → SENT)
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { submitPurchaseOrder } from '@/lib/services/purchaseOrderService';
import { handleApiError } from '@/lib/utils/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/purchase-orders/[id]/submit - Submit purchase order
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN and WAREHOUSE can submit POs
    if (!['ADMIN', 'WAREHOUSE'].includes(session.user.role)) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    
    await submitPurchaseOrder(id, session.user.id);

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}







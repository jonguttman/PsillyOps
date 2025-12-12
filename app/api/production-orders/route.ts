// API Route: Production Orders List & Create
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getProductionOrderList, createProductionOrder } from '@/lib/services/productionService';
import { handleApiError } from '@/lib/utils/errors';
import { createProductionOrderSchema } from '@/lib/utils/validators';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(req: NextRequest) {
  try {
    // 1. Validate
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!hasPermission(session.user.role, 'production', 'view')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams;
    const filter = {
      status: searchParams.get('status') as any || undefined,
      productId: searchParams.get('productId') || undefined,
      workCenterId: searchParams.get('workCenterId') || undefined,
      search: searchParams.get('search') || undefined,
      scheduledDateFrom: searchParams.get('scheduledDateFrom') 
        ? new Date(searchParams.get('scheduledDateFrom')!) 
        : undefined,
      scheduledDateTo: searchParams.get('scheduledDateTo') 
        ? new Date(searchParams.get('scheduledDateTo')!) 
        : undefined,
      limit: searchParams.get('limit') 
        ? parseInt(searchParams.get('limit')!) 
        : undefined,
      offset: searchParams.get('offset') 
        ? parseInt(searchParams.get('offset')!) 
        : undefined
    };

    // 2. Call Service
    const result = await getProductionOrderList(filter);

    // 3. Return JSON
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validate
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!hasPermission(session.user.role, 'production', 'create')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = createProductionOrderSchema.parse(body);

    // 2. Call Service
    const orderId = await createProductionOrder({
      productId: validated.productId,
      quantityToMake: validated.quantityToMake,
      batchSize: validated.batchSize,
      scheduledDate: validated.scheduledDate ? new Date(validated.scheduledDate) : undefined,
      dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
      workCenterId: validated.workCenterId,
      templateId: validated.templateId,
      linkedRetailerOrderIds: validated.linkedRetailerOrderIds,
      userId: session.user.id
    });

    // 3. Return JSON
    return Response.json({ success: true, orderId }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

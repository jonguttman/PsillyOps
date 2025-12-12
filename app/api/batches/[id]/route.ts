// API Route: Batch Detail & Update
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getBatchDetail, updateBatch } from '@/lib/services/productionService';
import { handleApiError } from '@/lib/utils/errors';
import { updateBatchSchema } from '@/lib/utils/validators';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    if (!hasPermission(session.user.role, 'batches', 'view')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // 2. Call Service
    const result = await getBatchDetail(params.id);

    // 3. Return JSON
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    if (!hasPermission(session.user.role, 'batches', 'update')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = updateBatchSchema.parse(body);

    // Convert date strings to Date objects
    const updates = {
      ...validated,
      manufactureDate: validated.manufactureDate ? new Date(validated.manufactureDate) : undefined,
      expirationDate: validated.expirationDate ? new Date(validated.expirationDate) : undefined,
      productionDate: validated.productionDate ? new Date(validated.productionDate) : undefined
    };

    // 2. Call Service
    await updateBatch(params.id, updates, session.user.id);

    // 3. Return JSON
    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

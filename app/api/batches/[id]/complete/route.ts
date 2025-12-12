// API Route: Complete Batch
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { completeBatch } from '@/lib/services/productionService';
import { handleApiError } from '@/lib/utils/errors';
import { completeBatchSchema } from '@/lib/utils/validators';
import { hasPermission } from '@/lib/auth/rbac';

export async function POST(
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

    if (!hasPermission(session.user.role, 'batches', 'complete')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = completeBatchSchema.parse(body);

    // 2. Call Service
    await completeBatch({
      batchId: params.id,
      actualQuantity: validated.actualQuantity,
      locationId: validated.locationId,
      productionDate: validated.productionDate,
      userId: session.user.id
    });

    // 3. Return JSON
    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}



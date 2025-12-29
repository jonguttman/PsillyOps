// API Route: Start Production Order
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { startProductionOrder } from '@/lib/services/productionService';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';

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

    if (!hasPermission(session.user.role, 'production', 'start')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    
    // Parse optional assignToUserId from body
    let assignToUserId: string | undefined;
    try {
      const body = await req.json();
      assignToUserId = body.assignToUserId;
    } catch {
      // No body or invalid JSON - that's fine, use defaults
    }

    // 2. Call Service - now returns productionRunId and batchIds
    const result = await startProductionOrder(id, session.user.id, assignToUserId);

    // 3. Return JSON with created resources
    return Response.json({ 
      success: true,
      productionRunId: result.productionRunId,
      batchIds: result.batchIds,
      batchCount: result.batchIds.length
    });
  } catch (error) {
    return handleApiError(error);
  }
}

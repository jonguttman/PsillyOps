// API Route: Associate QR Token with Batch
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { associateTokenWithBatch } from '@/lib/services/qrTokenAssociationService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    // 1. Validate auth - ADMIN, PRODUCTION, or WAREHOUSE
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const allowedRoles = ['ADMIN', 'PRODUCTION', 'WAREHOUSE'];
    if (!allowedRoles.includes(session.user.role)) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions to associate tokens' },
        { status: 403 }
      );
    }

    // 2. Parse and validate input
    const { id: tokenId } = await params;
    const body = await req.json();
    const { targetBatchId, reason, adminOverride } = body;

    if (!targetBatchId || typeof targetBatchId !== 'string') {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'targetBatchId is required');
    }

    // Only ADMIN can use adminOverride
    const effectiveAdminOverride = session.user.role === 'ADMIN' ? adminOverride : false;

    // 3. Call service
    const result = await associateTokenWithBatch({
      tokenId,
      targetBatchId,
      userId: session.user.id,
      reason: reason?.trim() || undefined,
      adminOverride: effectiveAdminOverride
    });

    // 4. Return response
    return Response.json(result);

  } catch (error) {
    return handleApiError(error);
  }
}

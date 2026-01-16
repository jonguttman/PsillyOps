// API Route: Get Eligible Tokens for Batch Association
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getEligibleTokensForBatch } from '@/lib/services/qrTokenAssociationService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { QRTokenStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
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
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // 2. Parse and validate query params
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');
    const statusParam = searchParams.get('status') || 'ACTIVE';
    const includeOtherProducts = searchParams.get('includeOtherProducts') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!batchId) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'batchId is required');
    }

    // Validate status param
    const validStatuses: (QRTokenStatus | 'all')[] = ['ACTIVE', 'REVOKED', 'EXPIRED', 'all'];
    const status = validStatuses.includes(statusParam as QRTokenStatus | 'all')
      ? (statusParam as QRTokenStatus | 'all')
      : 'ACTIVE';

    // Only ADMIN can use includeOtherProducts
    const effectiveIncludeOther = session.user.role === 'ADMIN' ? includeOtherProducts : false;

    // 3. Call service
    const result = await getEligibleTokensForBatch({
      batchId,
      userRole: session.user.role,
      status,
      includeOtherProducts: effectiveIncludeOther,
      limit: Math.min(limit, 100), // Cap at 100
      offset
    });

    // 4. Return response (mask token values for security)
    const maskedTokens = result.tokens.map(t => ({
      ...t,
      token: t.token.slice(0, 7) + '...' + t.token.slice(-4),
      printedAt: t.printedAt.toISOString()
    }));

    return Response.json({
      tokens: maskedTokens,
      total: result.total,
      batch: result.batch
    });

  } catch (error) {
    return handleApiError(error);
  }
}

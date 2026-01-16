// API Route: Resolve Scanned QR Token
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { resolveScannedToken } from '@/lib/services/qrTokenAssociationService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';

export async function POST(req: NextRequest) {
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

    // 2. Parse and validate input
    const body = await req.json();
    const { tokenValue, targetBatchId } = body;

    if (!tokenValue || typeof tokenValue !== 'string') {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'tokenValue is required');
    }

    // 3. Call service
    const result = await resolveScannedToken(tokenValue, targetBatchId);

    // 4. Return response
    if (!result.found) {
      return Response.json({
        found: false,
        message: 'Token not found or invalid format'
      });
    }

    // Mask token value for response
    return Response.json({
      found: true,
      token: result.token ? {
        ...result.token,
        token: result.token.token.slice(0, 7) + '...' + result.token.token.slice(-4),
        printedAt: result.token.printedAt.toISOString(),
        lastScannedAt: result.token.lastScannedAt?.toISOString() || null
      } : undefined,
      eligibility: result.eligibility
    });

  } catch (error) {
    return handleApiError(error);
  }
}

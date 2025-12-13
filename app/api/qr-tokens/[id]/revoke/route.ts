// API Route: Revoke Single QR Token
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { revokeToken } from '@/lib/services/qrTokenService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    // 1. Validate auth - ADMIN only
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Only administrators can revoke tokens' },
        { status: 403 }
      );
    }

    // 2. Parse and validate input
    const { id } = await params;
    const body = await req.json();
    const { reason } = body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'reason is required');
    }

    // 3. Call service
    const token = await revokeToken(id, reason.trim(), session.user.id);

    // 4. Return response
    return Response.json({
      success: true,
      token: {
        id: token.id,
        status: token.status,
        revokedAt: token.revokedAt?.toISOString(),
        revokedReason: token.revokedReason
      }
    });

  } catch (error) {
    return handleApiError(error);
  }
}


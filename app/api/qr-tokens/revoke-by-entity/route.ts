// API Route: Bulk Revoke QR Tokens by Entity
// STRICT LAYERING: Validate → Call Service → Return JSON
// Used for product recalls or batch invalidation

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { revokeTokensByEntity } from '@/lib/services/qrTokenService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { LabelEntityType } from '@prisma/client';

const VALID_ENTITY_TYPES: LabelEntityType[] = ['PRODUCT', 'BATCH', 'INVENTORY', 'CUSTOM'];

export async function POST(req: NextRequest) {
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
        { code: 'FORBIDDEN', message: 'Only administrators can bulk revoke tokens' },
        { status: 403 }
      );
    }

    // 2. Parse and validate input
    const body = await req.json();
    const { entityType, entityId, reason } = body;

    if (!entityType || !VALID_ENTITY_TYPES.includes(entityType)) {
      throw new AppError(
        ErrorCodes.INVALID_INPUT,
        `entityType must be one of: ${VALID_ENTITY_TYPES.join(', ')}`
      );
    }

    if (!entityId || typeof entityId !== 'string') {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'entityId is required');
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'reason is required');
    }

    // 3. Call service
    const revokedCount = await revokeTokensByEntity({
      entityType,
      entityId,
      reason: reason.trim(),
      userId: session.user.id
    });

    // 4. Return response
    return Response.json({
      success: true,
      entityType,
      entityId,
      revokedCount,
      reason: reason.trim()
    });

  } catch (error) {
    return handleApiError(error);
  }
}


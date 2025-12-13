// API Route: Create QR Tokens in Batch
// STRICT LAYERING: Validate → Call Service → Return JSON
//
// DEPRECATED: This route exists for internal/admin use only.
// Prefer /api/labels/render-with-tokens which creates tokens AND renders labels together.
// Tokens should only be created at print/render time to represent physical labels.
//
// TODO: Remove this route once all clients migrate to render-with-tokens

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { createTokenBatch, buildTokenUrl, getBaseUrl } from '@/lib/services/qrTokenService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { LabelEntityType } from '@prisma/client';

const VALID_ENTITY_TYPES: LabelEntityType[] = ['PRODUCT', 'BATCH', 'INVENTORY', 'CUSTOM'];

export async function POST(req: NextRequest) {
  try {
    // 1. Validate auth - ADMIN only for standalone token creation
    // This prevents accidental pre-generation of tokens outside rendering workflow
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Restrict to ADMIN only - normal users should use render-with-tokens
    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Use /api/labels/render-with-tokens for label printing' },
        { status: 403 }
      );
    }

    // 2. Parse and validate input
    const body = await req.json();
    const { entityType, entityId, versionId, quantity } = body;

    if (!entityType || !VALID_ENTITY_TYPES.includes(entityType)) {
      throw new AppError(
        ErrorCodes.INVALID_INPUT,
        `entityType must be one of: ${VALID_ENTITY_TYPES.join(', ')}`
      );
    }

    if (!entityId || typeof entityId !== 'string') {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'entityId is required');
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 1000) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'quantity must be between 1 and 1000');
    }

    // 3. Call service
    const tokens = await createTokenBatch({
      entityType,
      entityId,
      versionId: versionId || undefined,
      quantity: qty,
      userId: session.user.id
    });

    // 4. Build response with public URLs
    const baseUrl = getBaseUrl();
    const tokenData = tokens.map(t => ({
      id: t.id,
      token: t.token,
      url: buildTokenUrl(t.token, baseUrl)
    }));

    return Response.json({
      tokens: tokenData,
      entityType,
      entityId,
      quantity: tokens.length,
      createdAt: new Date().toISOString()
    }, { status: 201 });

  } catch (error) {
    return handleApiError(error);
  }
}


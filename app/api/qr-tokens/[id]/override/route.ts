// API Route: Token-level redirect override
// Set or clear the redirectUrl on a specific QR token

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/qr-tokens/[id]/override
 * Set a redirect override on a specific token
 * 
 * Body:
 * - redirectUrl: The URL to redirect to
 * 
 * Only ADMIN users can set token overrides.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

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
        { code: 'FORBIDDEN', message: 'Only administrators can set token overrides' },
        { status: 403 }
      );
    }

    // 2. Parse body
    const body = await req.json();
    const { redirectUrl } = body;

    if (!redirectUrl || typeof redirectUrl !== 'string') {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'redirectUrl is required');
    }

    // Validate URL format
    try {
      new URL(redirectUrl);
    } catch {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'redirectUrl must be a valid URL');
    }

    // 3. Get existing token
    const token = await prisma.qRToken.findUnique({
      where: { id }
    });

    if (!token) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Token not found');
    }

    if (token.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.INVALID_STATUS, 'Can only set override on active tokens');
    }

    const previousUrl = token.redirectUrl;

    // 4. Update token
    const updatedToken = await prisma.qRToken.update({
      where: { id },
      data: { redirectUrl }
    });

    // 5. Log action
    await logAction({
      entityType: ActivityEntity.LABEL,
      entityId: token.entityId,
      action: 'qr_token_override_set',
      userId: session.user.id,
      summary: `Set redirect override on token ${token.token.slice(0, 10)}... to ${redirectUrl}`,
      before: { redirectUrl: previousUrl },
      after: { redirectUrl },
      metadata: {
        tokenId: token.id,
        tokenValue: token.token,
        entityType: token.entityType,
        entityId: token.entityId
      },
      tags: ['qr', 'token', 'override']
    });

    return Response.json({
      success: true,
      token: {
        id: updatedToken.id,
        redirectUrl: updatedToken.redirectUrl
      }
    });

  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/qr-tokens/[id]/override
 * Clear the redirect override on a specific token
 * 
 * Only ADMIN users can clear token overrides.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

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
        { code: 'FORBIDDEN', message: 'Only administrators can clear token overrides' },
        { status: 403 }
      );
    }

    // 2. Get existing token
    const token = await prisma.qRToken.findUnique({
      where: { id }
    });

    if (!token) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Token not found');
    }

    const previousUrl = token.redirectUrl;

    if (!previousUrl) {
      return Response.json({
        success: true,
        message: 'Token has no override to clear'
      });
    }

    // 3. Clear override
    const updatedToken = await prisma.qRToken.update({
      where: { id },
      data: { redirectUrl: null }
    });

    // 4. Log action
    await logAction({
      entityType: ActivityEntity.LABEL,
      entityId: token.entityId,
      action: 'qr_token_override_cleared',
      userId: session.user.id,
      summary: `Cleared redirect override from token ${token.token.slice(0, 10)}...`,
      before: { redirectUrl: previousUrl },
      after: { redirectUrl: null },
      metadata: {
        tokenId: token.id,
        tokenValue: token.token,
        entityType: token.entityType,
        entityId: token.entityId,
        previousUrl
      },
      tags: ['qr', 'token', 'override', 'cleared']
    });

    return Response.json({
      success: true,
      token: {
        id: updatedToken.id,
        redirectUrl: updatedToken.redirectUrl
      }
    });

  } catch (error) {
    return handleApiError(error);
  }
}


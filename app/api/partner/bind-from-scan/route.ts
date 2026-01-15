/**
 * Bind from Scan API
 * 
 * POST /api/partner/bind-from-scan
 * 
 * Scanner-facing endpoint for batch binding during active sessions.
 * 
 * RESPONSE STATES:
 * - { status: "bound" } - New binding created successfully
 * - { status: "already_bound" } - Token already bound to SAME product (no-op, success haptic)
 * - { status: "rebind_required", previousProduct: {...} } - Token bound to DIFFERENT product
 * - { status: "error", message: "..." } - Validation failure
 * 
 * INVARIANT: already_bound is a no-op
 * - Triggers success haptic
 * - Does NOT create a new binding
 * - Does NOT increment scanCount
 * This avoids confusion when operators rescan by accident.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { isPartnerUser, canBindSeals } from '@/lib/auth/rbac';
import { UserRole, ProductType, BindingSource, ActivityEntity } from '@prisma/client';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/prisma';
import { getActiveSession, incrementScanCount } from '@/lib/services/bindingSessionService';
import { logAction } from '@/lib/services/loggingService';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { status: 'error', message: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!isPartnerUser(session.user.role as UserRole)) {
      return NextResponse.json(
        { status: 'error', message: 'Partner access required' },
        { status: 403 }
      );
    }

    if (!canBindSeals(session.user.role as UserRole)) {
      return NextResponse.json(
        { status: 'error', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    if (!session.user.partnerId) {
      return NextResponse.json(
        { status: 'error', message: 'User not assigned to partner' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { status: 'error', message: 'token is required' },
        { status: 400 }
      );
    }

    // Get active session
    const bindingSession = await getActiveSession(session.user.partnerId);

    if (!bindingSession) {
      return NextResponse.json(
        { status: 'error', message: 'No active binding session' },
        { status: 400 }
      );
    }

    // Look up token by value (could be full URL or just the token part)
    // Extract token from URL if needed (e.g., "https://originalpsilly.com/seal/qr_abc123")
    const tokenValue = extractTokenFromUrl(token);

    const tokenRecord = await prisma.qRToken.findUnique({
      where: { token: tokenValue },
      include: {
        sealSheet: {
          select: {
            id: true,
            partnerId: true,
            status: true,
          },
        },
        experienceBinding: {
          include: {
            partnerProduct: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
          },
        },
      },
    });

    if (!tokenRecord) {
      await logAction({
        entityType: ActivityEntity.LABEL,
        action: 'seal_scan_invalid',
        userId: session.user.id,
        summary: 'Invalid token scanned during session',
        metadata: {
          sessionId: bindingSession.id,
          scannedValue: token,
          reason: 'token_not_found',
          logCategory: 'certification',
        },
        tags: ['scan', 'invalid', 'certification'],
      });

      return NextResponse.json(
        { status: 'error', message: 'Token not found' },
        { status: 404 }
      );
    }

    // Validate token status
    if (tokenRecord.status === 'REVOKED') {
      return NextResponse.json(
        { status: 'error', message: 'Token is revoked' },
        { status: 400 }
      );
    }

    if (tokenRecord.status === 'EXPIRED' || 
        (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date())) {
      return NextResponse.json(
        { status: 'error', message: 'Token is expired' },
        { status: 400 }
      );
    }

    // Validate seal sheet
    if (!tokenRecord.sealSheet) {
      return NextResponse.json(
        { status: 'error', message: 'Token is not a TripDAR seal' },
        { status: 400 }
      );
    }

    if (tokenRecord.sealSheet.status === 'REVOKED') {
      return NextResponse.json(
        { status: 'error', message: 'Seal sheet is revoked' },
        { status: 400 }
      );
    }

    if (tokenRecord.sealSheet.partnerId !== session.user.partnerId) {
      return NextResponse.json(
        { status: 'error', message: 'Seal belongs to different partner' },
        { status: 403 }
      );
    }

    // Check if already bound
    if (tokenRecord.experienceBinding) {
      const existingBinding = tokenRecord.experienceBinding;
      
      // Check if bound to the SAME product (no-op success)
      if (existingBinding.partnerProductId === bindingSession.partnerProductId) {
        // INVARIANT: already_bound is a no-op
        // - Success haptic (handled by client)
        // - No new binding created
        // - No scanCount increment
        
        return NextResponse.json({
          status: 'already_bound',
          message: 'Token already bound to this product',
        });
      }
      
      // Bound to DIFFERENT product - rebind required
      await logAction({
        entityType: ActivityEntity.LABEL,
        entityId: tokenRecord.id,
        action: 'seal_rebind_detected',
        userId: session.user.id,
        summary: `Rebind detected: token bound to different product`,
        metadata: {
          sessionId: bindingSession.id,
          tokenId: tokenRecord.id,
          token: tokenRecord.token,
          currentProductId: existingBinding.partnerProductId,
          currentProductName: existingBinding.partnerProduct?.name,
          targetProductId: bindingSession.partnerProductId,
          targetProductName: bindingSession.partnerProduct.name,
          logCategory: 'certification',
        },
        tags: ['scan', 'rebind', 'detected', 'certification'],
      });

      return NextResponse.json({
        status: 'rebind_required',
        previousProduct: {
          id: existingBinding.partnerProductId,
          name: existingBinding.partnerProduct?.name || 'Unknown',
          sku: existingBinding.partnerProduct?.sku,
        },
        currentProduct: {
          id: bindingSession.partnerProductId,
          name: bindingSession.partnerProduct.name,
          sku: bindingSession.partnerProduct.sku,
        },
        tokenId: tokenRecord.id,
        existingBindingId: existingBinding.id,
      });
    }

    // Create new binding
    const binding = await prisma.experienceBinding.create({
      data: {
        sealTokenId: tokenRecord.id,
        partnerId: session.user.partnerId,
        productType: ProductType.PARTNER,
        productRefId: bindingSession.partnerProductId,
        partnerProductId: bindingSession.partnerProductId,
        boundVia: BindingSource.MOBILE_ASSIGNMENT,
        boundById: session.user.id,
        bindingSessionId: bindingSession.id,
        isRebind: false,
      },
    });

    // Increment scan count
    await incrementScanCount(bindingSession.id);

    // Log binding
    await logAction({
      entityType: ActivityEntity.LABEL,
      entityId: tokenRecord.id,
      action: 'seal_bound_via_session',
      userId: session.user.id,
      summary: `Seal bound to ${bindingSession.partnerProduct.name}`,
      metadata: {
        sessionId: bindingSession.id,
        bindingId: binding.id,
        tokenId: tokenRecord.id,
        token: tokenRecord.token,
        partnerId: session.user.partnerId,
        partnerProductId: bindingSession.partnerProductId,
        productName: bindingSession.partnerProduct.name,
        logCategory: 'certification',
      },
      tags: ['scan', 'bound', 'session', 'certification'],
    });

    return NextResponse.json({
      status: 'bound',
      bindingId: binding.id,
      tokenShortHash: tokenRecord.token.slice(-8),
      boundAt: binding.boundAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Extract token from URL or return as-is if already a token
 * Handles formats like:
 * - "qr_abc123" (just token)
 * - "https://originalpsilly.com/seal/qr_abc123" (full URL)
 * - "/seal/qr_abc123" (path only)
 */
function extractTokenFromUrl(input: string): string {
  // If it looks like a URL or path, extract the last segment
  if (input.includes('/')) {
    const parts = input.split('/');
    return parts[parts.length - 1];
  }
  return input;
}


/**
 * Confirm Rebind API
 * 
 * POST /api/partner/confirm-rebind
 * 
 * Confirms rebinding of a seal token from one product to another.
 * - Soft-revokes the previous binding (marks isRebind on new binding)
 * - Creates new binding with previousBindingId set
 * - Resumes scanning after confirmation
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
    const { tokenId, existingBindingId } = body;

    if (!tokenId) {
      return NextResponse.json(
        { status: 'error', message: 'tokenId is required' },
        { status: 400 }
      );
    }

    if (!existingBindingId) {
      return NextResponse.json(
        { status: 'error', message: 'existingBindingId is required' },
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

    // Verify token exists
    const tokenRecord = await prisma.qRToken.findUnique({
      where: { id: tokenId },
      include: {
        sealSheet: true,
        experienceBinding: {
          include: {
            partnerProduct: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!tokenRecord) {
      return NextResponse.json(
        { status: 'error', message: 'Token not found' },
        { status: 404 }
      );
    }

    // Verify the existing binding matches
    if (!tokenRecord.experienceBinding || tokenRecord.experienceBinding.id !== existingBindingId) {
      return NextResponse.json(
        { status: 'error', message: 'Binding state has changed. Please rescan.' },
        { status: 409 }
      );
    }

    const previousBinding = tokenRecord.experienceBinding;
    const previousProductName = previousBinding.partnerProduct?.name || 'Unknown';

    // Delete the old binding (we'll create a new one with rebind metadata)
    await prisma.experienceBinding.delete({
      where: { id: existingBindingId },
    });

    // Create new binding with rebind metadata
    const newBinding = await prisma.experienceBinding.create({
      data: {
        sealTokenId: tokenId,
        partnerId: session.user.partnerId,
        productType: ProductType.PARTNER,
        productRefId: bindingSession.partnerProductId,
        partnerProductId: bindingSession.partnerProductId,
        boundVia: BindingSource.MOBILE_ASSIGNMENT,
        boundById: session.user.id,
        bindingSessionId: bindingSession.id,
        isRebind: true,
        previousBindingId: existingBindingId,
      },
    });

    // Increment scan count
    await incrementScanCount(bindingSession.id);

    // Log rebind confirmation
    await logAction({
      entityType: ActivityEntity.LABEL,
      entityId: tokenId,
      action: 'seal_rebind_confirmed',
      userId: session.user.id,
      summary: `Seal rebound from ${previousProductName} to ${bindingSession.partnerProduct.name}`,
      metadata: {
        sessionId: bindingSession.id,
        newBindingId: newBinding.id,
        previousBindingId: existingBindingId,
        tokenId,
        token: tokenRecord.token,
        partnerId: session.user.partnerId,
        previousProductId: previousBinding.partnerProductId,
        previousProductName,
        newProductId: bindingSession.partnerProductId,
        newProductName: bindingSession.partnerProduct.name,
        logCategory: 'certification',
      },
      tags: ['scan', 'rebind', 'confirmed', 'certification'],
    });

    return NextResponse.json({
      status: 'rebound',
      bindingId: newBinding.id,
      tokenShortHash: tokenRecord.token.slice(-8),
      boundAt: newBinding.boundAt.toISOString(),
      previousProduct: previousProductName,
      newProduct: bindingSession.partnerProduct.name,
    });
  } catch (error) {
    return handleApiError(error);
  }
}


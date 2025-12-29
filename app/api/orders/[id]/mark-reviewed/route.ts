// API Route: Mark AI Order as Reviewed
// STRICT LAYERING: Validate → Check RBAC → Update Order → Log Action → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { UserRole, ActivityEntity } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { logAction, generateSummary } from '@/lib/services/loggingService';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Validate authentication
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // 2. Check RBAC permission (update or approve permission)
    const hasUpdatePermission = hasPermission(session.user.role as UserRole, 'orders', 'update');
    const hasApprovePermission = hasPermission(session.user.role as UserRole, 'orders', 'approve');
    
    if (!hasUpdatePermission && !hasApprovePermission) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'You do not have permission to review orders' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // 3. Fetch the order to verify it exists and is AI-created
    const order = await prisma.retailerOrder.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        createdByAI: true,
        aiReviewedAt: true,
      },
    });

    if (!order) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Order not found' },
        { status: 404 }
      );
    }

    if (!order.createdByAI) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Only AI-created orders can be marked as reviewed' },
        { status: 400 }
      );
    }

    if (order.aiReviewedAt) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Order has already been reviewed' },
        { status: 400 }
      );
    }

    // 4. Update the order
    const updatedOrder = await prisma.retailerOrder.update({
      where: { id },
      data: {
        aiReviewedAt: new Date(),
        aiReviewedByUserId: session.user.id,
      },
    });

    // 5. Log the action
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    
    await logAction({
      entityType: ActivityEntity.ORDER,
      entityId: id,
      action: 'ai_reviewed',
      userId: session.user.id,
      summary: generateSummary({
        userName: user?.name || 'User',
        action: 'reviewed',
        entityName: `AI order ${order.orderNumber}`,
      }),
      metadata: {
        reviewedAt: updatedOrder.aiReviewedAt,
      },
      tags: ['ai', 'reviewed'],
    });

    // 6. Return JSON
    return Response.json({
      success: true,
      message: 'Order marked as reviewed',
      aiReviewedAt: updatedOrder.aiReviewedAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}


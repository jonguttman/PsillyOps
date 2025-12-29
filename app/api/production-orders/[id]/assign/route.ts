// API Route: Assign Production Order
// POST /api/production-orders/[id]/assign - Assign or reassign a production order to a user

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { UserRole, ActivityEntity } from '@prisma/client';
import { logAction } from '@/lib/services/loggingService';

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

    // 2. Check RBAC permission
    if (!hasPermission(session.user.role as UserRole, 'production', 'assign')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'You do not have permission to assign production orders' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { assignedToUserId, reason } = body as { assignedToUserId?: string; reason?: string };

    if (!assignedToUserId) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'assignedToUserId is required' },
        { status: 400 }
      );
    }

    // 3. Verify production order exists
    const productionOrder = await prisma.productionOrder.findUnique({
      where: { id },
      include: {
        product: { select: { name: true } },
        assignedTo: { select: { id: true, name: true, role: true } },
      },
    });

    if (!productionOrder) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Production order not found' },
        { status: 404 }
      );
    }

    // 4. Verify assignee exists and is eligible to execute production
    const assignee = await prisma.user.findUnique({
      where: { id: assignedToUserId },
      select: { id: true, name: true, role: true, active: true },
    });

    if (!assignee) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Assignee user not found' },
        { status: 404 }
      );
    }

    if (!assignee.active) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Cannot assign to inactive user' },
        { status: 400 }
      );
    }

    if (!hasPermission(assignee.role as UserRole, 'production', 'execute')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Selected user does not have production.execute permission' },
        { status: 403 }
      );
    }

    // 5. Check status
    if (productionOrder.status === 'COMPLETED' || productionOrder.status === 'CANCELLED') {
      return Response.json(
        { code: 'INVALID_STATUS', message: `Cannot assign ${productionOrder.status.toLowerCase()} production order` },
        { status: 400 }
      );
    }

    const isReassignment = !!productionOrder.assignedToUserId;
    const previousAssigneeName = productionOrder.assignedTo?.name || null;

    // 6. Update order assignment
    const updatedOrder = await prisma.productionOrder.update({
      where: { id },
      data: {
        assignedToUserId,
        assignedByUserId: session.user.id,
        assignedAt: new Date(),
        assignmentReason: reason || null,
      },
      include: {
        product: { select: { name: true } },
        assignedTo: { select: { id: true, name: true, role: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    });

    // 7. Log action
    const actionType = isReassignment ? 'reassigned' : 'assigned';
    const summary = isReassignment
      ? `Production order reassigned from ${previousAssigneeName} to ${assignee.name}${reason ? ` (${reason})` : ''}`
      : `Production order assigned to ${assignee.name}${reason ? ` (${reason})` : ''}`;

    await logAction({
      entityType: ActivityEntity.PRODUCTION_ORDER,
      entityId: id,
      action: actionType,
      userId: session.user.id,
      summary,
      metadata: {
        orderNumber: productionOrder.orderNumber,
        productName: productionOrder.product.name,
        assignedToUserId,
        assignedToName: assignee.name,
        previousAssigneeId: isReassignment ? productionOrder.assignedToUserId : null,
        previousAssigneeName,
        reason,
      },
      tags: ['assignment', isReassignment ? 'reassignment' : 'new_assignment'],
    });

    return Response.json({
      success: true,
      message: `Production order ${actionType} successfully`,
      productionOrder: updatedOrder,
    });
  } catch (error) {
    return handleApiError(error);
  }
}



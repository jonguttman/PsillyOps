// API Route: Assign Production Run
// POST /api/production-runs/[id]/assign - Assign or reassign a production run to a user

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';

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
        { code: 'FORBIDDEN', message: 'You do not have permission to assign production runs' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { assignedToUserId, reason } = body;

    // 3. Validate assignedToUserId
    if (!assignedToUserId) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'assignedToUserId is required' },
        { status: 400 }
      );
    }

    // 4. Verify production run exists
    const productionRun = await prisma.productionRun.findUnique({
      where: { id },
      include: {
        product: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    });

    if (!productionRun) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Production run not found' },
        { status: 404 }
      );
    }

    // 5. Verify assignee exists and has production.execute permission
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

    // 6. Check if run is in a state that allows assignment
    if (productionRun.status === 'COMPLETED' || productionRun.status === 'CANCELLED') {
      return Response.json(
        { code: 'INVALID_STATUS', message: `Cannot assign ${productionRun.status.toLowerCase()} production run` },
        { status: 400 }
      );
    }

    // 7. Update production run with assignment
    const isReassignment = !!productionRun.assignedToUserId;
    const previousAssignee = productionRun.assignedTo?.name;

    const updatedRun = await prisma.productionRun.update({
      where: { id },
      data: {
        assignedToUserId,
        assignedByUserId: session.user.id,
        assignedAt: new Date(),
        assignmentReason: reason || null,
      },
      include: {
        product: { select: { name: true } },
        assignedTo: { select: { name: true } },
        assignedBy: { select: { name: true } },
      },
    });

    // 8. Log the assignment action
    const actionType = isReassignment ? 'reassigned' : 'assigned';
    const summary = isReassignment
      ? `Production run for ${productionRun.product.name} reassigned from ${previousAssignee} to ${assignee.name}${reason ? ` (${reason})` : ''}`
      : `Production run for ${productionRun.product.name} assigned to ${assignee.name}${reason ? ` (${reason})` : ''}`;

    await logAction({
      entityType: ActivityEntity.PRODUCTION_RUN,
      entityId: id,
      action: actionType,
      userId: session.user.id,
      summary,
      metadata: {
        productName: productionRun.product.name,
        assignedToUserId,
        assignedToName: assignee.name,
        previousAssigneeId: isReassignment ? productionRun.assignedToUserId : null,
        previousAssigneeName: previousAssignee,
        reason,
      },
      tags: ['assignment', isReassignment ? 'reassignment' : 'new_assignment'],
    });

    return Response.json({
      success: true,
      message: `Production run ${actionType} successfully`,
      productionRun: updatedRun,
    });
  } catch (error) {
    return handleApiError(error);
  }
}


// WORK CENTER SERVICE - Production work center management
// Business logic for work centers

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { ActivityEntity } from '@prisma/client';

/**
 * List all work centers
 */
export async function listWorkCenters(includeInactive = false) {
  const where = includeInactive ? {} : { active: true };

  const workCenters = await prisma.workCenter.findMany({
    where,
    include: {
      _count: {
        select: { productionOrders: true }
      }
    },
    orderBy: { name: 'asc' }
  });

  return workCenters;
}

/**
 * Get work center by ID
 */
export async function getWorkCenter(id: string) {
  const workCenter = await prisma.workCenter.findUnique({
    where: { id },
    include: {
      productionOrders: {
        where: {
          status: { in: ['PLANNED', 'IN_PROGRESS', 'BLOCKED'] }
        },
        include: {
          product: { select: { id: true, name: true } }
        },
        orderBy: { scheduledDate: 'asc' }
      },
      _count: {
        select: { productionOrders: true }
      }
    }
  });

  if (!workCenter) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Work center not found');
  }

  return workCenter;
}

/**
 * Create a new work center
 */
export async function createWorkCenter(params: {
  name: string;
  description?: string;
  userId: string;
}): Promise<string> {
  const { name, description, userId } = params;

  // Check for duplicate name
  const existing = await prisma.workCenter.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } }
  });

  if (existing) {
    throw new AppError(ErrorCodes.DUPLICATE, 'Work center with this name already exists');
  }

  const workCenter = await prisma.workCenter.create({
    data: {
      name,
      description,
      active: true
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.WORK_CENTER,
    entityId: workCenter.id,
    action: 'created',
    userId,
    summary: `${user?.name || 'User'} created work center ${name}`,
    details: { name, description },
    tags: ['created']
  });

  return workCenter.id;
}

/**
 * Update a work center
 */
export async function updateWorkCenter(
  id: string,
  updates: {
    name?: string;
    description?: string;
    active?: boolean;
  },
  userId: string
): Promise<void> {
  const workCenter = await prisma.workCenter.findUnique({
    where: { id }
  });

  if (!workCenter) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Work center not found');
  }

  // Check for duplicate name if updating name
  if (updates.name && updates.name !== workCenter.name) {
    const existing = await prisma.workCenter.findFirst({
      where: {
        name: { equals: updates.name, mode: 'insensitive' },
        id: { not: id }
      }
    });

    if (existing) {
      throw new AppError(ErrorCodes.DUPLICATE, 'Work center with this name already exists');
    }
  }

  const before = {
    name: workCenter.name,
    description: workCenter.description,
    active: workCenter.active
  };

  await prisma.workCenter.update({
    where: { id },
    data: updates
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.WORK_CENTER,
    entityId: id,
    action: 'updated',
    userId,
    summary: `${user?.name || 'User'} updated work center ${workCenter.name}`,
    before,
    after: updates,
    tags: ['updated']
  });
}

/**
 * Archive a work center (soft delete)
 */
export async function archiveWorkCenter(id: string, userId: string): Promise<void> {
  const workCenter = await prisma.workCenter.findUnique({
    where: { id },
    include: {
      productionOrders: {
        where: {
          status: { in: ['PLANNED', 'IN_PROGRESS', 'BLOCKED'] }
        }
      }
    }
  });

  if (!workCenter) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Work center not found');
  }

  // Check for active production orders
  if (workCenter.productionOrders.length > 0) {
    throw new AppError(
      ErrorCodes.INVALID_OPERATION,
      `Cannot archive work center with ${workCenter.productionOrders.length} active production order(s)`
    );
  }

  await prisma.workCenter.update({
    where: { id },
    data: { active: false }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.WORK_CENTER,
    entityId: id,
    action: 'archived',
    userId,
    summary: `${user?.name || 'User'} archived work center ${workCenter.name}`,
    before: { active: true },
    after: { active: false },
    tags: ['archived']
  });
}

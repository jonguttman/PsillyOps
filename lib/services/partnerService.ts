/**
 * Partner Service
 * 
 * Manages TripDAR Partner accounts and operations.
 * 
 * PHASE 2B SCOPE & NON-GOALS:
 * ===========================
 * Phase 2B intentionally does NOT implement:
 * - Partner billing/invoicing
 * - Partner self-service account creation
 * - Partner marketplace or directory
 * - Partner-to-partner interactions
 * 
 * Phase 2B provides:
 * - Partner CRUD (ADMIN only)
 * - User assignment to partners
 * - Partner suspension/reactivation
 * - Suspension enforcement (blocks write operations)
 */

import { prisma } from '@/lib/db/prisma';
import { PartnerStatus, UserRole } from '@prisma/client';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { ActivityEntity } from '@prisma/client';

export interface CreatePartnerParams {
  name: string;
  createdById: string;
}

export interface AssignUserToPartnerParams {
  userId: string;
  partnerId: string;
  role: UserRole.PARTNER_ADMIN | UserRole.PARTNER_OPERATOR;
  assignedById: string;
}

/**
 * Create a new Partner
 */
export async function createPartner(params: CreatePartnerParams) {
  const { name, createdById } = params;

  // Verify creator exists and is ADMIN
  const creator = await prisma.user.findUnique({
    where: { id: createdById },
  });

  if (!creator) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
  }

  if (creator.role !== 'ADMIN') {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Only ADMIN users can create partners');
  }

  // Create partner
  const partner = await prisma.partner.create({
    data: {
      name,
      status: PartnerStatus.ACTIVE,
    },
  });

  // Log creation
  await logAction({
    entityType: ActivityEntity.ORDER, // Using ORDER as placeholder - may need new entity type
    entityId: partner.id,
    action: 'partner_created',
    userId: createdById,
    summary: `Partner created: ${name}`,
    metadata: {
      partnerId: partner.id,
      partnerName: name,
      logCategory: 'partner',
    },
    tags: ['partner', 'created'],
  });

  return partner;
}

/**
 * Get partner by ID
 */
export async function getPartner(id: string) {
  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
        },
      },
    },
  });

  if (!partner) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Partner not found');
  }

  return partner;
}

/**
 * List all partners (ADMIN only)
 */
export async function listPartners() {
  return await prisma.partner.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      _count: {
        select: {
          sealSheets: true,
          products: true,
        },
      },
    },
  });
}

/**
 * Suspend a partner
 */
export async function suspendPartner(
  partnerId: string,
  reason: string,
  suspendedById: string
) {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Partner not found');
  }

  if (partner.status === PartnerStatus.SUSPENDED) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Partner is already suspended');
  }

  const updated = await prisma.partner.update({
    where: { id: partnerId },
    data: {
      status: PartnerStatus.SUSPENDED,
    },
  });

  // Log suspension
  await logAction({
    entityType: ActivityEntity.ORDER,
    entityId: partnerId,
    action: 'partner_suspended',
    userId: suspendedById,
    summary: `Partner suspended: ${partner.name}`,
    metadata: {
      partnerId,
      partnerName: partner.name,
      reason,
      logCategory: 'partner',
    },
    tags: ['partner', 'suspended'],
  });

  return updated;
}

/**
 * Reactivate a suspended partner
 */
export async function reactivatePartner(
  partnerId: string,
  reactivatedById: string
) {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Partner not found');
  }

  if (partner.status === PartnerStatus.ACTIVE) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Partner is already active');
  }

  const updated = await prisma.partner.update({
    where: { id: partnerId },
    data: {
      status: PartnerStatus.ACTIVE,
    },
  });

  // Log reactivation
  await logAction({
    entityType: ActivityEntity.ORDER,
    entityId: partnerId,
    action: 'partner_reactivated',
    userId: reactivatedById,
    summary: `Partner reactivated: ${partner.name}`,
    metadata: {
      partnerId,
      partnerName: partner.name,
      logCategory: 'partner',
    },
    tags: ['partner', 'reactivated'],
  });

  return updated;
}

/**
 * Assign a user to a partner
 */
export async function assignUserToPartner(params: AssignUserToPartnerParams) {
  const { userId, partnerId, role, assignedById } = params;

  // Verify partner exists
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Partner not found');
  }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
  }

  // Verify role is valid partner role
  if (role !== 'PARTNER_ADMIN' && role !== 'PARTNER_OPERATOR') {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Role must be PARTNER_ADMIN or PARTNER_OPERATOR'
    );
  }

  // Update user
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      partnerId,
      role,
    },
  });

  // Log assignment
  await logAction({
    entityType: ActivityEntity.ORDER,
    entityId: partnerId,
    action: 'user_assigned_to_partner',
    userId: assignedById,
    summary: `User ${user.name} assigned to partner ${partner.name} as ${role}`,
    metadata: {
      partnerId,
      partnerName: partner.name,
      userId,
      userName: user.name,
      role,
      logCategory: 'partner',
    },
    tags: ['partner', 'user_assignment'],
  });

  return updated;
}

/**
 * Remove a user from a partner (revert to default role)
 */
export async function removeUserFromPartner(
  userId: string,
  removedById: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      partner: true,
    },
  });

  if (!user) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
  }

  if (!user.partnerId) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'User is not assigned to a partner');
  }

  const partnerId = user.partnerId;
  const partnerName = user.partner?.name || 'Unknown';

  // Update user to remove partner assignment
  // Note: We don't change the role - that should be done separately
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      partnerId: null,
    },
  });

  // Log removal
  await logAction({
    entityType: ActivityEntity.ORDER,
    entityId: partnerId,
    action: 'user_removed_from_partner',
    userId: removedById,
    summary: `User ${user.name} removed from partner ${partnerName}`,
    metadata: {
      partnerId,
      partnerName,
      userId,
      userName: user.name,
      logCategory: 'partner',
    },
    tags: ['partner', 'user_removal'],
  });

  return updated;
}


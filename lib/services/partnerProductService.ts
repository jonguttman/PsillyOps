/**
 * Partner Product Service
 * 
 * Manages lightweight product definitions for partners.
 * Partner products are for experience context only, not inventory.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { ActivityEntity } from '@prisma/client';

export interface CreatePartnerProductParams {
  partnerId: string;
  name: string;
  sku?: string;
  vibesProfileId?: string;
  createdById: string;
}

export interface UpdatePartnerProductParams {
  id: string;
  name?: string;
  sku?: string;
  vibesProfileId?: string;
  updatedById: string;
}

/**
 * Create a new partner product
 */
export async function createPartnerProduct(params: CreatePartnerProductParams) {
  const { partnerId, name, sku, vibesProfileId, createdById } = params;

  // Verify partner exists
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Partner not found');
  }

  // Verify partner is not suspended (blocks new product creation)
  if (partner.status === 'SUSPENDED') {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      'Partner is suspended. Cannot create new products.'
    );
  }

  // Verify vibes profile exists if provided
  if (vibesProfileId) {
    const vibesProfile = await prisma.vibesProfile.findUnique({
      where: { id: vibesProfileId },
    });

    if (!vibesProfile) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Vibes profile not found');
    }

    // Verify vibes profile belongs to partner or is PSILLYOPS-owned
    if (vibesProfile.ownerType === 'PARTNER' && vibesProfile.ownerId !== partnerId) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        'Vibes profile does not belong to this partner'
      );
    }
  }

  // Create product (unique constraint on partnerId + name is enforced at DB level)
  const product = await prisma.partnerProduct.create({
    data: {
      partnerId,
      name,
      sku: sku || null,
      vibesProfileId: vibesProfileId || null,
    },
  });

  // Log creation
  await logAction({
    entityType: ActivityEntity.PRODUCT,
    entityId: product.id,
    action: 'partner_product_created',
    userId: createdById,
    summary: `Partner product created: ${name}`,
    metadata: {
      productId: product.id,
      partnerId,
      partnerName: partner.name,
      productName: name,
      sku,
      vibesProfileId,
      logCategory: 'partner',
    },
    tags: ['partner', 'product', 'created'],
  });

  return product;
}

/**
 * List all products for a partner
 */
export async function listPartnerProducts(partnerId: string) {
  // Verify partner exists
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Partner not found');
  }

  return await prisma.partnerProduct.findMany({
    where: {
      partnerId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      vibesProfile: {
        select: {
          id: true,
          name: true,
          mode: true,
          ownerType: true,
        },
      },
      _count: {
        select: {
          bindings: true,
        },
      },
    },
  });
}

/**
 * Get partner product by ID
 */
export async function getPartnerProduct(id: string, partnerId?: string) {
  const product = await prisma.partnerProduct.findUnique({
    where: { id },
    include: {
      partner: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      vibesProfile: true,
      _count: {
        select: {
          bindings: true,
        },
      },
    },
  });

  if (!product) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Partner product not found');
  }

  // If partnerId provided, verify it matches
  if (partnerId && product.partnerId !== partnerId) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Product does not belong to this partner');
  }

  return product;
}

/**
 * Update a partner product
 */
export async function updatePartnerProduct(params: UpdatePartnerProductParams) {
  const { id, name, sku, vibesProfileId, updatedById } = params;

  // Verify product exists
  const product = await prisma.partnerProduct.findUnique({
    where: { id },
    include: {
      partner: true,
    },
  });

  if (!product) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Partner product not found');
  }

  // Verify partner is not suspended (blocks product updates)
  if (product.partner.status === 'SUSPENDED') {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      'Partner is suspended. Cannot update products.'
    );
  }

  // Verify vibes profile exists if provided
  if (vibesProfileId) {
    const vibesProfile = await prisma.vibesProfile.findUnique({
      where: { id: vibesProfileId },
    });

    if (!vibesProfile) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Vibes profile not found');
    }

    // Verify vibes profile belongs to partner or is PSILLYOPS-owned
    if (vibesProfile.ownerType === 'PARTNER' && vibesProfile.ownerId !== product.partnerId) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        'Vibes profile does not belong to this partner'
      );
    }
  }

  // Build update data
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (sku !== undefined) updateData.sku = sku || null;
  if (vibesProfileId !== undefined) updateData.vibesProfileId = vibesProfileId || null;

  // Update product
  const updated = await prisma.partnerProduct.update({
    where: { id },
    data: updateData,
  });

  // Log update
  await logAction({
    entityType: ActivityEntity.PRODUCT,
    entityId: id,
    action: 'partner_product_updated',
    userId: updatedById,
    summary: `Partner product updated: ${updated.name}`,
    metadata: {
      productId: id,
      partnerId: product.partnerId,
      partnerName: product.partner.name,
      productName: updated.name,
      changes: updateData,
      logCategory: 'partner',
    },
    tags: ['partner', 'product', 'updated'],
  });

  return updated;
}

/**
 * Delete a partner product (soft delete - check if bindings exist first)
 */
export async function deletePartnerProduct(id: string, deletedById: string) {
  // Verify product exists
  const product = await prisma.partnerProduct.findUnique({
    where: { id },
    include: {
      partner: true,
      _count: {
        select: {
          bindings: true,
        },
      },
    },
  });

  if (!product) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Partner product not found');
  }

  // Check if product has any bindings
  if (product._count.bindings > 0) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `Cannot delete product with ${product._count.bindings} active seal bindings`
    );
  }

  // Delete product
  await prisma.partnerProduct.delete({
    where: { id },
  });

  // Log deletion
  await logAction({
    entityType: ActivityEntity.PRODUCT,
    entityId: id,
    action: 'partner_product_deleted',
    userId: deletedById,
    summary: `Partner product deleted: ${product.name}`,
    metadata: {
      productId: id,
      partnerId: product.partnerId,
      partnerName: product.partner.name,
      productName: product.name,
      logCategory: 'partner',
    },
    tags: ['partner', 'product', 'deleted'],
  });

  return { success: true };
}


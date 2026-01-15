/**
 * Experience Binding Service
 * 
 * Manages binding of seal tokens to products (PartnerProduct or PsillyOps Product).
 * 
 * Bindings are append-only - once a seal is bound, it cannot be silently reassigned.
 * Any rebinding requires explicit revocation and rebind (future feature).
 * 
 * PHASE 2B SCOPE & NON-GOALS:
 * ===========================
 * Phase 2B intentionally does NOT implement:
 * - Mobile batch scanning (scan many → auto-bind)
 * - Timed scan windows (BindingSession model)
 * - Anti-sharing enforcement
 * - Device-level binding locks
 * - Batch binding operations
 * 
 * These are implemented in Phase 2C+.
 * 
 * Phase 2B provides:
 * - Single-seal binding API
 * - Partner suspension enforcement
 * - Binding validation and audit logging
 */

import { prisma } from '@/lib/db/prisma';
import { ProductType, BindingSource } from '@prisma/client';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { ActivityEntity } from '@prisma/client';

export interface BindSealToProductParams {
  tokenId: string; // QRToken.id (not token value)
  partnerId: string;
  productType: ProductType;
  productRefId: string; // ID in PartnerProduct or Product table
  vibesProfileId?: string;
  boundById: string;
  boundVia: BindingSource;
}

/**
 * Bind a seal token to a product
 * 
 * Validates that:
 * - Token exists and is part of a sheet assigned to the partner
 * - Product exists (in appropriate table based on productType)
 * - Token is not already bound
 * - Vibes profile (if provided) is valid and accessible
 * 
 * POLYMORPHISM INVARIANT:
 * Exactly ONE product reference must be set:
 * - partnerProductId (when productType === 'PARTNER')
 * - productRefId points to Product table (when productType === 'PSILLYOPS')
 * 
 * The unused reference is explicitly set to null.
 */
export async function bindSealToProduct(params: BindSealToProductParams) {
  const {
    tokenId,
    partnerId,
    productType,
    productRefId,
    vibesProfileId,
    boundById,
    boundVia,
  } = params;

  // ============================================
  // POLYMORPHISM INVARIANT VALIDATION
  // ============================================
  // Validate productType is valid before any other checks
  if (productType !== 'PARTNER' && productType !== 'PSILLYOPS') {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Invalid productType. Must be PARTNER or PSILLYOPS'
    );
  }

  // Validate productRefId is provided
  if (!productRefId) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `productRefId is required for ${productType} binding`
    );
  }

  // Verify token exists and get related data
  const token = await prisma.qRToken.findUnique({
    where: { id: tokenId },
    include: {
      sealSheet: {
        include: {
          partner: true,
        },
      },
      experienceBinding: true,
    },
  });

  if (!token) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Token not found');
  }

  // Verify token is part of a seal sheet
  if (!token.sealSheet) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Token is not part of a seal sheet'
    );
  }

  // Verify sheet is assigned to the partner
  if (token.sealSheet.partnerId !== partnerId) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      'Token belongs to a sheet assigned to a different partner'
    );
  }

  // Verify partner is not suspended (blocks new bindings)
  if (token.sealSheet.partner?.status === 'SUSPENDED') {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      'Partner is suspended. Cannot bind new seals.'
    );
  }

  // Verify sheet is not revoked
  if (token.sealSheet.status === 'REVOKED') {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Cannot bind tokens from a revoked sheet'
    );
  }

  // Verify token is not already bound
  if (token.experienceBinding) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Token is already bound to a product'
    );
  }

  // Verify product exists based on productType
  // (productType already validated above)
  if (productType === 'PARTNER') {
    const partnerProduct = await prisma.partnerProduct.findUnique({
      where: { id: productRefId },
    });

    if (!partnerProduct) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Partner product not found');
    }

    // Verify product belongs to the partner
    if (partnerProduct.partnerId !== partnerId) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        'Partner product does not belong to this partner'
      );
    }
  } else {
    // productType === 'PSILLYOPS'
    const psillyProduct = await prisma.product.findUnique({
      where: { id: productRefId },
    });

    if (!psillyProduct) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
    }
  }

  // Verify vibes profile if provided
  if (vibesProfileId) {
    const vibesProfile = await prisma.vibesProfile.findUnique({
      where: { id: vibesProfileId },
    });

    if (!vibesProfile) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Vibes profile not found');
    }

    // Verify vibes profile is accessible to partner (PSILLYOPS-owned or partner-owned)
    if (vibesProfile.ownerType === 'PARTNER' && vibesProfile.ownerId !== partnerId) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        'Vibes profile does not belong to this partner'
      );
    }
  }

  // ============================================
  // CREATE BINDING WITH EXACTLY-ONE INVARIANT
  // ============================================
  // Enforce exactly one product reference:
  // - partnerProductId is set ONLY when productType === 'PARTNER'
  // - partnerProductId is explicitly null when productType === 'PSILLYOPS'
  const bindingData = {
    sealTokenId: tokenId,
    partnerId,
    productType,
    productRefId,
    // INVARIANT: Exactly one product reference
    partnerProductId: productType === 'PARTNER' ? productRefId : null,
    vibesProfileId: vibesProfileId || null,
    boundVia,
    boundById,
  };

  const binding = await prisma.experienceBinding.create({
    data: bindingData,
    include: {
      partner: {
        select: {
          id: true,
          name: true,
        },
      },
      boundBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Log binding
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: tokenId,
    action: 'seal_bound_to_product',
    userId: boundById,
    summary: `Seal bound to ${productType} product`,
    metadata: {
      bindingId: binding.id,
      tokenId,
      token: token.token,
      partnerId,
      partnerName: binding.partner.name,
      productType,
      productRefId,
      vibesProfileId,
      boundVia,
      logCategory: 'certification',
    },
    tags: ['seal', 'tripdar', 'binding', 'certification'],
  });

  return binding;
}

/**
 * Get binding by token ID
 */
export async function getBindingByToken(tokenId: string) {
  const binding = await prisma.experienceBinding.findUnique({
    where: { sealTokenId: tokenId },
    include: {
      partner: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      vibesProfile: true,
      boundBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      sealToken: {
        select: {
          id: true,
          token: true,
          status: true,
        },
      },
    },
  });

  return binding;
}

/**
 * Get bindings by partner
 */
export async function getBindingsByPartner(partnerId: string, limit = 100) {
  return await prisma.experienceBinding.findMany({
    where: { partnerId },
    take: limit,
    orderBy: {
      boundAt: 'desc',
    },
    include: {
      vibesProfile: {
        select: {
          id: true,
          name: true,
          mode: true,
        },
      },
      boundBy: {
        select: {
          id: true,
          name: true,
        },
      },
      sealToken: {
        select: {
          id: true,
          token: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Get bindings by product (resolves based on productType)
 */
export async function getBindingsByProduct(
  productType: ProductType,
  productRefId: string,
  limit = 100
) {
  return await prisma.experienceBinding.findMany({
    where: {
      productType,
      productRefId,
    },
    take: limit,
    orderBy: {
      boundAt: 'desc',
    },
    include: {
      partner: {
        select: {
          id: true,
          name: true,
        },
      },
      vibesProfile: {
        select: {
          id: true,
          name: true,
          mode: true,
        },
      },
      boundBy: {
        select: {
          id: true,
          name: true,
        },
      },
      sealToken: {
        select: {
          id: true,
          token: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Get binding statistics for a partner
 */
export async function getBindingStats(partnerId: string) {
  const [totalBindings, byProductType, byBoundVia] = await Promise.all([
    prisma.experienceBinding.count({
      where: { partnerId },
    }),
    prisma.experienceBinding.groupBy({
      by: ['productType'],
      where: { partnerId },
      _count: true,
    }),
    prisma.experienceBinding.groupBy({
      by: ['boundVia'],
      where: { partnerId },
      _count: true,
    }),
  ]);

  return {
    totalBindings,
    byProductType: byProductType.reduce(
      (acc, item) => {
        acc[item.productType] = item._count;
        return acc;
      },
      {} as Record<ProductType, number>
    ),
    byBoundVia: byBoundVia.reduce(
      (acc, item) => {
        acc[item.boundVia] = item._count;
        return acc;
      },
      {} as Record<BindingSource, number>
    ),
  };
}


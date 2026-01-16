// QR TOKEN ASSOCIATION SERVICE
// Enables associating QR tokens with batches after labels are printed
// Supports pre-printed generic labels and batch reassignments

import { prisma } from '@/lib/db/prisma';
import { logAction } from './loggingService';
import { ActivityEntity, LabelEntityType, QRTokenStatus } from '@prisma/client';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { isValidTokenFormat } from './qrTokenService';

// ========================================
// TYPES
// ========================================

export interface AssociateTokenParams {
  tokenId: string;
  targetBatchId: string;
  userId: string;
  reason?: string;
  adminOverride?: boolean;
}

export interface AssociationResult {
  success: boolean;
  token: {
    id: string;
    token: string;
    entityType: LabelEntityType;
    entityId: string;
    previousEntityType: LabelEntityType;
    previousEntityId: string;
  };
  batch: {
    id: string;
    batchCode: string;
    productName: string;
  };
}

export interface EligibleTokensQuery {
  batchId: string;
  userRole: string;
  status?: QRTokenStatus | 'all';
  includeOtherProducts?: boolean;
  limit?: number;
  offset?: number;
}

export interface EligibleToken {
  id: string;
  token: string;
  status: QRTokenStatus;
  entityType: LabelEntityType;
  entityId: string;
  entityName: string;
  printedAt: Date;
  scanCount: number;
  isEligible: boolean;
  eligibilityReason?: string;
  requiresAdminOverride?: boolean;
}

export interface EligibleTokensResult {
  tokens: EligibleToken[];
  total: number;
  batch: {
    id: string;
    batchCode: string;
    productId: string;
    productName: string;
  };
}

export interface ResolvedScannedToken {
  found: boolean;
  token?: {
    id: string;
    token: string;
    status: QRTokenStatus;
    entityType: LabelEntityType;
    entityId: string;
    entityName: string;
    printedAt: Date;
    scanCount: number;
    lastScannedAt: Date | null;
  };
  eligibility?: {
    eligible: boolean;
    reason?: string;
    requiresAdminOverride?: boolean;
  };
}

export interface AssociationEligibility {
  eligible: boolean;
  reason?: string;
  requiresAdminOverride?: boolean;
}

interface AssociationHistoryEntry {
  timestamp: string;
  previousEntityType: LabelEntityType;
  previousEntityId: string;
  newEntityType: LabelEntityType;
  newEntityId: string;
  associatedByUserId: string;
  reason?: string;
  adminOverride?: boolean;
}

// ========================================
// ASSOCIATION FUNCTIONS
// ========================================

/**
 * Associate a token with a batch
 * - Validates token exists and is ACTIVE
 * - Validates target batch exists
 * - Checks product restriction (token.entityId matches batch.productId) unless admin override
 * - Updates token: entityType=BATCH, entityId=batchId
 * - Appends to metadata.associationHistory
 * - Logs the action
 */
export async function associateTokenWithBatch(params: AssociateTokenParams): Promise<AssociationResult> {
  const { tokenId, targetBatchId, userId, reason, adminOverride } = params;

  // Get the token
  const token = await prisma.qRToken.findUnique({
    where: { id: tokenId }
  });

  if (!token) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Token not found');
  }

  if (token.status === 'REVOKED') {
    throw new AppError(ErrorCodes.CONFLICT, 'Token has been revoked and cannot be associated');
  }

  if (token.status === 'EXPIRED') {
    throw new AppError(ErrorCodes.CONFLICT, 'Token has expired and cannot be associated');
  }

  // Get the target batch with product info
  const batch = await prisma.batch.findUnique({
    where: { id: targetBatchId },
    include: {
      product: {
        select: { id: true, name: true }
      }
    }
  });

  if (!batch) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
  }

  // Check product restriction
  // If token is PRODUCT type, entityId is the productId
  // If token is BATCH type, we need to get the batch's productId
  let tokenProductId: string | null = null;

  if (token.entityType === 'PRODUCT') {
    tokenProductId = token.entityId;
  } else if (token.entityType === 'BATCH') {
    const existingBatch = await prisma.batch.findUnique({
      where: { id: token.entityId },
      select: { productId: true }
    });
    tokenProductId = existingBatch?.productId || null;
  }

  // Check if this is a cross-product association
  const isCrossProduct = tokenProductId && tokenProductId !== batch.productId;

  if (isCrossProduct && !adminOverride) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      'Token belongs to a different product. Admin override required for cross-product association.'
    );
  }

  // Store previous values for history
  const previousEntityType = token.entityType;
  const previousEntityId = token.entityId;

  // Build association history entry
  const historyEntry: AssociationHistoryEntry = {
    timestamp: new Date().toISOString(),
    previousEntityType,
    previousEntityId,
    newEntityType: 'BATCH',
    newEntityId: targetBatchId,
    associatedByUserId: userId,
    reason,
    adminOverride: isCrossProduct ? adminOverride : undefined
  };

  // Get existing metadata and append history
  const existingMetadata = (token.metadata as Record<string, unknown>) || {};
  const existingHistory = (existingMetadata.associationHistory as AssociationHistoryEntry[]) || [];

  const newMetadata = {
    ...existingMetadata,
    associationHistory: [...existingHistory, historyEntry]
  };

  // Update the token
  const updatedToken = await prisma.qRToken.update({
    where: { id: tokenId },
    data: {
      entityType: 'BATCH',
      entityId: targetBatchId,
      metadata: newMetadata
    }
  });

  // Get previous entity name for logging
  let previousEntityName = '';
  if (previousEntityType === 'PRODUCT') {
    const product = await prisma.product.findUnique({
      where: { id: previousEntityId },
      select: { name: true }
    });
    previousEntityName = product?.name || previousEntityId;
  } else if (previousEntityType === 'BATCH') {
    const prevBatch = await prisma.batch.findUnique({
      where: { id: previousEntityId },
      select: { batchCode: true }
    });
    previousEntityName = prevBatch?.batchCode || previousEntityId;
  }

  // Log the action
  await logAction({
    entityType: ActivityEntity.BATCH,
    entityId: targetBatchId,
    action: 'qr_token_associated',
    userId,
    summary: `Associated QR token with batch ${batch.batchCode}`,
    metadata: {
      tokenId: token.id,
      tokenValue: token.token.slice(0, 10) + '...',
      previousEntityType,
      previousEntityId,
      previousEntityName,
      newBatchId: targetBatchId,
      newBatchCode: batch.batchCode,
      adminOverride: isCrossProduct ? adminOverride : undefined,
      reason
    },
    tags: ['qr', 'association', ...(isCrossProduct && adminOverride ? ['admin_override'] : [])]
  });

  return {
    success: true,
    token: {
      id: updatedToken.id,
      token: updatedToken.token,
      entityType: updatedToken.entityType,
      entityId: updatedToken.entityId,
      previousEntityType,
      previousEntityId
    },
    batch: {
      id: batch.id,
      batchCode: batch.batchCode,
      productName: batch.product.name
    }
  };
}

/**
 * Get tokens eligible for association with a batch
 * - For non-admins: Only PRODUCT-type tokens where entityId matches batch.productId
 * - For admins with includeOtherProducts: All PRODUCT-type tokens
 */
export async function getEligibleTokensForBatch(query: EligibleTokensQuery): Promise<EligibleTokensResult> {
  const {
    batchId,
    userRole,
    status = 'ACTIVE',
    includeOtherProducts = false,
    limit = 50,
    offset = 0
  } = query;

  // Get the batch with product info
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      product: {
        select: { id: true, name: true }
      }
    }
  });

  if (!batch) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
  }

  const isAdmin = userRole === 'ADMIN';

  // Build the where clause
  const whereClause: Record<string, unknown> = {
    entityType: 'PRODUCT', // Only PRODUCT tokens can be associated to batches
  };

  // Status filter
  if (status !== 'all') {
    whereClause.status = status;
  }

  // Product restriction (unless admin with includeOtherProducts)
  if (!isAdmin || !includeOtherProducts) {
    whereClause.entityId = batch.productId;
  }

  // Get total count
  const total = await prisma.qRToken.count({ where: whereClause });

  // Get tokens with pagination
  const tokens = await prisma.qRToken.findMany({
    where: whereClause,
    orderBy: { printedAt: 'desc' },
    take: limit,
    skip: offset
  });

  // Enrich tokens with entity names and eligibility
  const enrichedTokens: EligibleToken[] = await Promise.all(
    tokens.map(async (token) => {
      let entityName = '';

      if (token.entityType === 'PRODUCT') {
        const product = await prisma.product.findUnique({
          where: { id: token.entityId },
          select: { name: true }
        });
        entityName = product?.name || token.entityId;
      }

      const isSameProduct = token.entityId === batch.productId;
      const isActive = token.status === 'ACTIVE';

      return {
        id: token.id,
        token: token.token,
        status: token.status,
        entityType: token.entityType,
        entityId: token.entityId,
        entityName,
        printedAt: token.printedAt,
        scanCount: token.scanCount,
        isEligible: isActive && (isSameProduct || (isAdmin && includeOtherProducts)),
        eligibilityReason: !isActive
          ? `Token is ${token.status.toLowerCase()}`
          : (!isSameProduct ? 'Different product - requires admin override' : undefined),
        requiresAdminOverride: !isSameProduct && isActive
      };
    })
  );

  return {
    tokens: enrichedTokens,
    total,
    batch: {
      id: batch.id,
      batchCode: batch.batchCode,
      productId: batch.productId,
      productName: batch.product.name
    }
  };
}

/**
 * Resolve a scanned token value to its full record
 * - Validates token format
 * - Returns token with entity details (product name, batch code, etc.)
 * - Indicates if token is eligible for association
 */
export async function resolveScannedToken(
  tokenValue: string,
  targetBatchId?: string
): Promise<ResolvedScannedToken> {
  // Validate format
  if (!isValidTokenFormat(tokenValue)) {
    return { found: false };
  }

  // Find the token
  const token = await prisma.qRToken.findUnique({
    where: { token: tokenValue }
  });

  if (!token) {
    return { found: false };
  }

  // Get entity name
  let entityName = '';
  if (token.entityType === 'PRODUCT') {
    const product = await prisma.product.findUnique({
      where: { id: token.entityId },
      select: { name: true }
    });
    entityName = product?.name || token.entityId;
  } else if (token.entityType === 'BATCH') {
    const batch = await prisma.batch.findUnique({
      where: { id: token.entityId },
      select: { batchCode: true }
    });
    entityName = batch?.batchCode || token.entityId;
  } else if (token.entityType === 'INVENTORY') {
    const inv = await prisma.inventoryItem.findUnique({
      where: { id: token.entityId },
      select: { lotNumber: true }
    });
    entityName = inv?.lotNumber || token.entityId;
  }

  const result: ResolvedScannedToken = {
    found: true,
    token: {
      id: token.id,
      token: token.token,
      status: token.status,
      entityType: token.entityType,
      entityId: token.entityId,
      entityName,
      printedAt: token.printedAt,
      scanCount: token.scanCount,
      lastScannedAt: token.lastScannedAt
    }
  };

  // Check eligibility if target batch provided
  if (targetBatchId) {
    const eligibility = await validateAssociationEligibility(token.id, targetBatchId);
    result.eligibility = eligibility;
  }

  return result;
}

/**
 * Validate if a token can be associated with a batch
 */
export async function validateAssociationEligibility(
  tokenId: string,
  batchId: string
): Promise<AssociationEligibility> {
  const token = await prisma.qRToken.findUnique({
    where: { id: tokenId }
  });

  if (!token) {
    return { eligible: false, reason: 'Token not found' };
  }

  if (token.status === 'REVOKED') {
    return { eligible: false, reason: 'Token has been revoked' };
  }

  if (token.status === 'EXPIRED') {
    return { eligible: false, reason: 'Token has expired' };
  }

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { productId: true }
  });

  if (!batch) {
    return { eligible: false, reason: 'Batch not found' };
  }

  // Get the token's product ID
  let tokenProductId: string | null = null;

  if (token.entityType === 'PRODUCT') {
    tokenProductId = token.entityId;
  } else if (token.entityType === 'BATCH') {
    const existingBatch = await prisma.batch.findUnique({
      where: { id: token.entityId },
      select: { productId: true }
    });
    tokenProductId = existingBatch?.productId || null;
  }

  // Check product match
  if (tokenProductId && tokenProductId !== batch.productId) {
    return {
      eligible: false,
      reason: 'Token belongs to a different product',
      requiresAdminOverride: true
    };
  }

  // Already associated with this batch?
  if (token.entityType === 'BATCH' && token.entityId === batchId) {
    return {
      eligible: false,
      reason: 'Token is already associated with this batch'
    };
  }

  return { eligible: true };
}

/**
 * Get tokens currently associated with a batch
 */
export async function getTokensForBatch(batchId: string) {
  return prisma.qRToken.findMany({
    where: {
      entityType: 'BATCH',
      entityId: batchId
    },
    orderBy: { printedAt: 'desc' }
  });
}

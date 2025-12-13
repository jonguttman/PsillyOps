// QR TOKEN SERVICE - Tokenized QR code management for label traceability
// Each physical label has a unique opaque token resolved server-side
//
// IMPORTANT: QR tokens must only be created at print/render time.
// Do NOT pre-generate tokens outside the label rendering workflow.
// Tokens represent physical label instances and should not exist without a rendered label.

import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { logAction } from './loggingService';
import { ActivityEntity, LabelEntityType, QRTokenStatus } from '@prisma/client';
import { AppError, ErrorCodes } from '@/lib/utils/errors';

// ========================================
// TYPES
// ========================================

export interface CreateTokenParams {
  entityType: LabelEntityType;
  entityId: string;
  versionId?: string;
  expiresAt?: Date;
  userId?: string;
}

export interface CreateTokenBatchParams {
  entityType: LabelEntityType;
  entityId: string;
  versionId?: string;
  quantity: number;
  userId?: string;
}

export interface ResolveResult {
  status: QRTokenStatus;
  entityType: LabelEntityType;
  entityId: string;
  message?: string;
  token?: {
    id: string;
    scanCount: number;
    printedAt: Date;
    revokedReason?: string | null;
  };
}

export interface RevokeByEntityParams {
  entityType: LabelEntityType;
  entityId: string;
  reason: string;
  userId?: string;
}

// ========================================
// TOKEN GENERATION
// ========================================

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const TOKEN_LENGTH = 22; // ~131 bits of entropy

/**
 * Generate a cryptographically random opaque token
 * Format: qr_<22-char-base62-string>
 * Example: qr_2x7kP9mN4vBcRtYz8LqW5j
 */
export function generateToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH);
  let token = 'qr_';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += BASE62[bytes[i] % 62];
  }
  return token;
}

/**
 * Validate token format
 */
export function isValidTokenFormat(token: string): boolean {
  if (!token.startsWith('qr_')) return false;
  if (token.length !== TOKEN_LENGTH + 3) return false; // qr_ prefix + 22 chars
  const body = token.slice(3);
  return /^[0-9A-Za-z]+$/.test(body);
}

// ========================================
// TOKEN CREATION
// ========================================

/**
 * Create a single QR token
 */
export async function createToken(params: CreateTokenParams) {
  const { entityType, entityId, versionId, expiresAt, userId } = params;

  // Verify entity exists
  await verifyEntityExists(entityType, entityId);

  // Verify version exists if provided
  if (versionId) {
    const version = await prisma.labelTemplateVersion.findUnique({
      where: { id: versionId }
    });
    if (!version) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
    }
  }

  const token = generateToken();

  const qrToken = await prisma.qRToken.create({
    data: {
      token,
      entityType,
      entityId,
      versionId,
      expiresAt,
      createdByUserId: userId
    }
  });

  return qrToken;
}

/**
 * Create multiple QR tokens for batch printing
 * Each physical label gets its own unique token
 * 
 * IMPORTANT: This function should ONLY be called from label render routes/services.
 * Tokens represent physical labels and must not be pre-generated outside rendering.
 * 
 * @internal Called by labelService.renderLabelsWithTokens and render-with-tokens API
 */
export async function createTokenBatch(params: CreateTokenBatchParams) {
  const { entityType, entityId, versionId, quantity, userId } = params;

  if (quantity < 1 || quantity > 1000) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 'Quantity must be between 1 and 1000');
  }

  // Verify entity exists
  await verifyEntityExists(entityType, entityId);

  // Verify version exists if provided
  if (versionId) {
    const version = await prisma.labelTemplateVersion.findUnique({
      where: { id: versionId }
    });
    if (!version) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
    }
  }

  // Generate all tokens
  const tokens: string[] = [];
  for (let i = 0; i < quantity; i++) {
    tokens.push(generateToken());
  }

  // Bulk create tokens
  const createdTokens = await prisma.$transaction(
    tokens.map(token =>
      prisma.qRToken.create({
        data: {
          token,
          entityType,
          entityId,
          versionId,
          createdByUserId: userId
        }
      })
    )
  );

  // Log the batch creation
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId,
    action: 'qr_tokens_created',
    userId,
    summary: `Created ${quantity} QR token(s) for ${entityType} ${entityId}`,
    details: {
      entityType,
      entityId,
      quantity,
      versionId,
      tokenIds: createdTokens.slice(0, 10).map(t => t.id) // Log first 10 IDs only
    },
    tags: ['qr', 'label', 'print']
  });

  return createdTokens;
}

// ========================================
// TOKEN RESOLUTION
// ========================================

/**
 * Resolve a token to its entity
 * Used when a QR code is scanned
 */
export async function resolveToken(tokenValue: string): Promise<ResolveResult | null> {
  if (!isValidTokenFormat(tokenValue)) {
    return null;
  }

  const token = await prisma.qRToken.findUnique({
    where: { token: tokenValue }
  });

  if (!token) {
    return null;
  }

  // Check expiration
  if (token.expiresAt && token.expiresAt < new Date()) {
    // Auto-expire if not already marked
    if (token.status === 'ACTIVE') {
      await prisma.qRToken.update({
        where: { id: token.id },
        data: { status: 'EXPIRED' }
      });
    }
    return {
      status: 'EXPIRED',
      entityType: token.entityType,
      entityId: token.entityId,
      message: 'This QR code has expired'
    };
  }

  // Return status-appropriate response
  if (token.status === 'REVOKED') {
    return {
      status: 'REVOKED',
      entityType: token.entityType,
      entityId: token.entityId,
      message: token.revokedReason || 'This QR code has been revoked',
      token: {
        id: token.id,
        scanCount: token.scanCount,
        printedAt: token.printedAt,
        revokedReason: token.revokedReason
      }
    };
  }

  if (token.status === 'EXPIRED') {
    return {
      status: 'EXPIRED',
      entityType: token.entityType,
      entityId: token.entityId,
      message: 'This QR code has expired'
    };
  }

  // Token is active - increment scan count
  const isFirstScan = token.scanCount === 0;
  
  await prisma.qRToken.update({
    where: { id: token.id },
    data: {
      scanCount: { increment: 1 },
      lastScannedAt: new Date()
    }
  });

  // Log only the first scan to reduce activity log noise
  // Subsequent scans still increment scanCount but don't create log entries
  if (isFirstScan) {
    await logAction({
      entityType: ActivityEntity.LABEL,
      entityId: token.entityId,
      action: 'qr_token_scanned',
      summary: `QR token first scanned for ${token.entityType} ${token.entityId}`,
      details: {
        tokenId: token.id,
        entityType: token.entityType,
        entityId: token.entityId,
        scanCount: 1
      },
      tags: ['qr', 'label', 'scan']
    });
  }

  return {
    status: 'ACTIVE',
    entityType: token.entityType,
    entityId: token.entityId,
    token: {
      id: token.id,
      scanCount: token.scanCount + 1,
      printedAt: token.printedAt
    }
  };
}

// ========================================
// TOKEN REVOCATION
// ========================================

/**
 * Revoke a single token by ID
 * Used for individual label invalidation
 */
export async function revokeToken(
  tokenId: string,
  reason: string,
  userId?: string
) {
  const token = await prisma.qRToken.findUnique({
    where: { id: tokenId }
  });

  if (!token) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Token not found');
  }

  if (token.status === 'REVOKED') {
    throw new AppError(ErrorCodes.CONFLICT, 'Token is already revoked');
  }

  const updated = await prisma.qRToken.update({
    where: { id: tokenId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokedReason: reason
    }
  });

  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: token.entityId,
    action: 'qr_token_revoked',
    userId,
    summary: `Revoked QR token for ${token.entityType} ${token.entityId}: ${reason}`,
    details: {
      tokenId: token.id,
      entityType: token.entityType,
      entityId: token.entityId,
      reason,
      scanCount: token.scanCount
    },
    tags: ['qr', 'label', 'revoke']
  });

  return updated;
}

/**
 * Revoke all tokens for an entity
 * Used for product recalls or batch invalidation
 */
export async function revokeTokensByEntity(params: RevokeByEntityParams): Promise<number> {
  const { entityType, entityId, reason, userId } = params;

  const result = await prisma.qRToken.updateMany({
    where: {
      entityType,
      entityId,
      status: 'ACTIVE'
    },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokedReason: reason
    }
  });

  if (result.count > 0) {
    await logAction({
      entityType: ActivityEntity.LABEL,
      entityId,
      action: 'qr_tokens_bulk_revoked',
      userId,
      summary: `Bulk revoked ${result.count} QR token(s) for ${entityType} ${entityId}: ${reason}`,
      details: {
        entityType,
        entityId,
        count: result.count,
        reason
      },
      tags: ['qr', 'label', 'revoke', 'bulk']
    });
  }

  return result.count;
}

// ========================================
// QUERY FUNCTIONS
// ========================================

/**
 * Get a token by internal ID (admin use)
 */
export async function getToken(id: string) {
  return prisma.qRToken.findUnique({
    where: { id },
    include: {
      version: {
        include: { template: true }
      },
      createdBy: {
        select: { id: true, name: true, email: true }
      }
    }
  });
}

/**
 * Get a token by its public token value
 */
export async function getTokenByValue(tokenValue: string) {
  if (!isValidTokenFormat(tokenValue)) {
    return null;
  }
  return prisma.qRToken.findUnique({
    where: { token: tokenValue }
  });
}

/**
 * Get all tokens for an entity
 */
export async function getTokensForEntity(
  entityType: LabelEntityType,
  entityId: string,
  options?: {
    status?: QRTokenStatus;
    limit?: number;
    offset?: number;
  }
) {
  const where: any = { entityType, entityId };
  if (options?.status) {
    where.status = options.status;
  }

  const [tokens, total] = await Promise.all([
    prisma.qRToken.findMany({
      where,
      orderBy: { printedAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
      include: {
        version: {
          select: { id: true, version: true }
        }
      }
    }),
    prisma.qRToken.count({ where })
  ]);

  return { tokens, total };
}

/**
 * Get all tokens for a label version
 */
export async function getTokensForVersion(
  versionId: string,
  options?: {
    status?: QRTokenStatus;
    limit?: number;
  }
) {
  const where: any = { versionId };
  if (options?.status) {
    where.status = options.status;
  }

  return prisma.qRToken.findMany({
    where,
    orderBy: { printedAt: 'desc' },
    take: options?.limit || 100
  });
}

/**
 * Get token statistics for an entity
 */
export async function getTokenStats(entityType: LabelEntityType, entityId: string) {
  const [total, active, revoked, expired, totalScans] = await Promise.all([
    prisma.qRToken.count({ where: { entityType, entityId } }),
    prisma.qRToken.count({ where: { entityType, entityId, status: 'ACTIVE' } }),
    prisma.qRToken.count({ where: { entityType, entityId, status: 'REVOKED' } }),
    prisma.qRToken.count({ where: { entityType, entityId, status: 'EXPIRED' } }),
    prisma.qRToken.aggregate({
      where: { entityType, entityId },
      _sum: { scanCount: true }
    })
  ]);

  return {
    total,
    active,
    revoked,
    expired,
    totalScans: totalScans._sum.scanCount || 0
  };
}

// ========================================
// URL HELPERS
// ========================================

/**
 * Build the public URL for a token
 */
export function buildTokenUrl(token: string, baseUrl: string): string {
  return `${baseUrl}/qr/${token}`;
}

/**
 * Get the base URL for QR codes
 */
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

// ========================================
// INTERNAL HELPERS
// ========================================

/**
 * Verify that the referenced entity exists
 */
async function verifyEntityExists(entityType: LabelEntityType, entityId: string) {
  let exists = false;

  switch (entityType) {
    case 'PRODUCT':
      exists = !!(await prisma.product.findUnique({ where: { id: entityId } }));
      break;
    case 'BATCH':
      exists = !!(await prisma.batch.findUnique({ where: { id: entityId } }));
      break;
    case 'INVENTORY':
      exists = !!(await prisma.inventoryItem.findUnique({ where: { id: entityId } }));
      break;
    case 'CUSTOM':
      // Custom entities don't require verification
      exists = true;
      break;
  }

  if (!exists) {
    throw new AppError(ErrorCodes.NOT_FOUND, `${entityType} not found: ${entityId}`);
  }
}


// QR REDIRECT SERVICE - Group-based redirect rules for QR tokens
// Allows redirecting entire groups of QR scans (by entityType+entityId or versionId)
// without modifying individual QR tokens. Supports campaigns, recalls, and analytics.
//
// PRECEDENCE ORDER:
// 1. Token-level redirectUrl (QRToken.redirectUrl) - highest priority
// 2. Active QRRedirectRule for Batch (entityType=BATCH + entityId)
// 3. Active QRRedirectRule for Product (entityType=PRODUCT + entityId)
// 4. Active QRRedirectRule for Version (versionId)
// 5. Default Redirect (isFallback=true) - system-level fallback
// 6. Default entity routing (no redirect)

import { prisma } from '@/lib/db/prisma';
import { logAction } from './loggingService';
import { ActivityEntity, LabelEntityType } from '@prisma/client';
import { AppError, ErrorCodes } from '@/lib/utils/errors';

// ========================================
// TYPES
// ========================================

export interface CreateRedirectRuleParams {
  entityType?: LabelEntityType;
  entityId?: string;
  versionId?: string;
  redirectUrl: string;
  reason?: string;
  startsAt?: Date;
  endsAt?: Date;
}

export interface RedirectRuleResult {
  id: string;
  redirectUrl: string;
  reason: string | null;
  matchedBy: 'BATCH' | 'PRODUCT' | 'ENTITY' | 'VERSION' | 'FALLBACK';
}

// ========================================
// RULE LOOKUP
// ========================================

/**
 * Find an active redirect rule that applies to a given token context.
 * 
 * Resolution order (most specific to least specific):
 * 1. Batch rule (entityType=BATCH + entityId)
 * 2. Product rule (entityType=PRODUCT + entityId)
 * 3. Other entity rules (INVENTORY, CUSTOM)
 * 4. Version rule (versionId)
 * 5. Default Redirect (isFallback=true) - system-level fallback
 * 
 * Only returns rules where:
 * - active = true
 * - isFallback = false (for entity/version rules)
 * - startsAt is null OR <= now
 * - endsAt is null OR >= now
 * 
 * @returns The matching rule or null if no active rule applies
 */
export async function findActiveRedirectRule(params: {
  entityType: LabelEntityType;
  entityId: string;
  versionId?: string | null;
  batchId?: string | null; // Optional: for batch-specific lookups
}): Promise<RedirectRuleResult | null> {
  const { entityType, entityId, versionId, batchId } = params;
  const now = new Date();

  // Build base conditions for active rules within time window
  const baseWhere = {
    active: true,
    isFallback: false, // Exclude fallback from normal rule matching
    OR: [
      { startsAt: null },
      { startsAt: { lte: now } }
    ],
    AND: [
      {
        OR: [
          { endsAt: null },
          { endsAt: { gte: now } }
        ]
      }
    ]
  };

  // 1. Check for Batch rule first (most specific)
  if (batchId || entityType === 'BATCH') {
    const batchIdToCheck = batchId || entityId;
    const batchRule = await prisma.qRRedirectRule.findFirst({
      where: {
        ...baseWhere,
        entityType: 'BATCH',
        entityId: batchIdToCheck,
        versionId: null
      },
      orderBy: { createdAt: 'desc' }
    });

    if (batchRule) {
      return {
        id: batchRule.id,
        redirectUrl: batchRule.redirectUrl,
        reason: batchRule.reason,
        matchedBy: 'BATCH'
      };
    }
  }

  // 2. Check for Product rule
  if (entityType === 'PRODUCT') {
    const productRule = await prisma.qRRedirectRule.findFirst({
      where: {
        ...baseWhere,
        entityType: 'PRODUCT',
        entityId,
        versionId: null
      },
      orderBy: { createdAt: 'desc' }
    });

    if (productRule) {
      return {
        id: productRule.id,
        redirectUrl: productRule.redirectUrl,
        reason: productRule.reason,
        matchedBy: 'PRODUCT'
      };
    }
  }

  // 3. Check for other entity rules (INVENTORY, CUSTOM)
  if (entityType !== 'BATCH' && entityType !== 'PRODUCT') {
    const entityRule = await prisma.qRRedirectRule.findFirst({
      where: {
        ...baseWhere,
        entityType,
        entityId,
        versionId: null
      },
      orderBy: { createdAt: 'desc' }
    });

    if (entityRule) {
      return {
        id: entityRule.id,
        redirectUrl: entityRule.redirectUrl,
        reason: entityRule.reason,
        matchedBy: 'ENTITY'
      };
    }
  }

  // 4. Check for Version rule
  if (versionId) {
    const versionRule = await prisma.qRRedirectRule.findFirst({
      where: {
        ...baseWhere,
        versionId,
        entityType: null,
        entityId: null
      },
      orderBy: { createdAt: 'desc' }
    });

    if (versionRule) {
      return {
        id: versionRule.id,
        redirectUrl: versionRule.redirectUrl,
        reason: versionRule.reason,
        matchedBy: 'VERSION'
      };
    }
  }

  // 5. Check for Default Redirect (fallback)
  const fallbackRule = await findActiveFallbackRedirect();
  if (fallbackRule) {
    return {
      id: fallbackRule.id,
      redirectUrl: fallbackRule.redirectUrl,
      reason: fallbackRule.reason,
      matchedBy: 'FALLBACK'
    };
  }

  return null;
}

/**
 * Find the active default redirect (fallback) rule.
 * Only one fallback can exist. Returns null if none configured or inactive.
 */
export async function findActiveFallbackRedirect(): Promise<{
  id: string;
  redirectUrl: string;
  reason: string | null;
} | null> {
  const now = new Date();

  const fallback = await prisma.qRRedirectRule.findFirst({
    where: {
      isFallback: true,
      active: true,
      OR: [
        { startsAt: null },
        { startsAt: { lte: now } }
      ],
      AND: [
        {
          OR: [
            { endsAt: null },
            { endsAt: { gte: now } }
          ]
        }
      ]
    }
  });

  if (!fallback) {
    return null;
  }

  return {
    id: fallback.id,
    redirectUrl: fallback.redirectUrl,
    reason: fallback.reason
  };
}

// ========================================
// RULE CREATION
// ========================================

/**
 * Create a new QR redirect rule.
 * 
 * Validation:
 * - Exactly one scope selector must be provided:
 *   - entityType + entityId (both required together)
 *   - OR versionId alone
 * - redirectUrl must be a valid URL
 * - Only one active rule per scope is allowed
 * 
 * @throws AppError if validation fails
 */
export async function createRedirectRule(
  params: CreateRedirectRuleParams,
  userId?: string
) {
  const { entityType, entityId, versionId, redirectUrl, reason, startsAt, endsAt } = params;

  // Validate scope selector - exactly one must be provided
  const hasEntityScope = entityType && entityId;
  const hasVersionScope = !!versionId;

  if (hasEntityScope && hasVersionScope) {
    throw new AppError(
      ErrorCodes.INVALID_INPUT,
      'Cannot specify both entityType+entityId and versionId. Choose one scope.'
    );
  }

  if (!hasEntityScope && !hasVersionScope) {
    throw new AppError(
      ErrorCodes.INVALID_INPUT,
      'Must specify either entityType+entityId or versionId as scope selector.'
    );
  }

  if ((entityType && !entityId) || (!entityType && entityId)) {
    throw new AppError(
      ErrorCodes.INVALID_INPUT,
      'Both entityType and entityId must be provided together.'
    );
  }

  // Validate redirectUrl is a valid URL
  try {
    new URL(redirectUrl);
  } catch {
    throw new AppError(
      ErrorCodes.INVALID_INPUT,
      'redirectUrl must be a valid URL.'
    );
  }

  // Validate time window if both are provided
  if (startsAt && endsAt && startsAt >= endsAt) {
    throw new AppError(
      ErrorCodes.INVALID_INPUT,
      'startsAt must be before endsAt.'
    );
  }

  // Check if there's already an active rule for this scope
  const existingRule = await prisma.qRRedirectRule.findFirst({
    where: {
      active: true,
      ...(hasEntityScope
        ? { entityType, entityId, versionId: null }
        : { versionId, entityType: null, entityId: null })
    }
  });

  if (existingRule) {
    throw new AppError(
      ErrorCodes.CONFLICT,
      `An active redirect rule already exists for this scope. Deactivate rule ${existingRule.id} first, or create an inactive rule.`
    );
  }

  // Verify entity exists if entity-scoped
  if (hasEntityScope) {
    await verifyEntityExists(entityType!, entityId!);
  }

  // Verify version exists if version-scoped
  if (hasVersionScope) {
    const version = await prisma.labelTemplateVersion.findUnique({
      where: { id: versionId }
    });
    if (!version) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Label template version not found.');
    }
  }

  // Create the rule
  const rule = await prisma.qRRedirectRule.create({
    data: {
      entityType: hasEntityScope ? entityType : null,
      entityId: hasEntityScope ? entityId : null,
      versionId: hasVersionScope ? versionId : null,
      redirectUrl,
      reason,
      startsAt,
      endsAt,
      createdById: userId
    }
  });

  // Log the action
  await logAction({
    entityType: ActivityEntity.SYSTEM,
    entityId: rule.id,
    action: 'qr_redirect_rule_created',
    userId,
    summary: `Created QR redirect rule: ${hasEntityScope ? `${entityType} ${entityId}` : `version ${versionId}`} → ${redirectUrl}`,
    metadata: {
      ruleId: rule.id,
      scope: hasEntityScope ? 'entity' : 'version',
      entityType: rule.entityType,
      entityId: rule.entityId,
      versionId: rule.versionId,
      redirectUrl,
      reason,
      startsAt,
      endsAt
    },
    tags: ['qr', 'redirect', 'rule', 'created']
  });

  return rule;
}

// ========================================
// RULE DEACTIVATION
// ========================================

/**
 * Deactivate an existing redirect rule.
 * 
 * This does not delete the rule, allowing for audit trail preservation.
 * Once deactivated, the rule will no longer match QR scans.
 */
export async function deactivateRedirectRule(
  ruleId: string,
  userId?: string
) {
  const rule = await prisma.qRRedirectRule.findUnique({
    where: { id: ruleId }
  });

  if (!rule) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Redirect rule not found.');
  }

  if (!rule.active) {
    throw new AppError(ErrorCodes.CONFLICT, 'Rule is already inactive.');
  }

  const updated = await prisma.qRRedirectRule.update({
    where: { id: ruleId },
    data: { active: false }
  });

  // Log the action
  await logAction({
    entityType: ActivityEntity.SYSTEM,
    entityId: rule.id,
    action: 'qr_redirect_rule_deactivated',
    userId,
    summary: `Deactivated QR redirect rule: ${rule.entityType ? `${rule.entityType} ${rule.entityId}` : `version ${rule.versionId}`}`,
    metadata: {
      ruleId: rule.id,
      scope: rule.entityType ? 'entity' : 'version',
      entityType: rule.entityType,
      entityId: rule.entityId,
      versionId: rule.versionId,
      redirectUrl: rule.redirectUrl,
      reason: rule.reason
    },
    tags: ['qr', 'redirect', 'rule', 'deactivated']
  });

  return updated;
}

// ========================================
// QUERY FUNCTIONS
// ========================================

/**
 * Get a redirect rule by ID
 */
export async function getRedirectRule(id: string) {
  return prisma.qRRedirectRule.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true }
      }
    }
  });
}

/**
 * List all redirect rules with optional filters
 */
export async function listRedirectRules(options?: {
  active?: boolean;
  entityType?: LabelEntityType;
  entityId?: string;
  versionId?: string;
  limit?: number;
  offset?: number;
}) {
  const where: any = {};

  if (options?.active !== undefined) {
    where.active = options.active;
  }

  if (options?.entityType) {
    where.entityType = options.entityType;
  }

  if (options?.entityId) {
    where.entityId = options.entityId;
  }

  if (options?.versionId) {
    where.versionId = options.versionId;
  }

  const [rules, total] = await Promise.all([
    prisma.qRRedirectRule.findMany({
      where,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0
    }),
    prisma.qRRedirectRule.count({ where })
  ]);

  return { rules, total };
}

/**
 * Get rules for a specific entity
 */
export async function getRulesForEntity(
  entityType: LabelEntityType,
  entityId: string
) {
  return prisma.qRRedirectRule.findMany({
    where: {
      entityType,
      entityId
    },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Get rules for a specific label version
 */
export async function getRulesForVersion(versionId: string) {
  return prisma.qRRedirectRule.findMany({
    where: { versionId },
    orderBy: { createdAt: 'desc' }
  });
}

// ========================================
// TOKEN COUNT HELPERS
// ========================================

/**
 * Count QR tokens that would be affected by a redirect rule
 */
export async function countAffectedTokens(params: {
  entityType?: LabelEntityType | null;
  entityId?: string | null;
  versionId?: string | null;
}): Promise<number> {
  const { entityType, entityId, versionId } = params;

  if (entityType && entityId) {
    // Count tokens for this entity
    return prisma.qRToken.count({
      where: {
        entityType,
        entityId,
        status: 'ACTIVE'
      }
    });
  }

  if (versionId) {
    // Count tokens for this label version
    return prisma.qRToken.count({
      where: {
        versionId,
        status: 'ACTIVE'
      }
    });
  }

  return 0;
}

/**
 * Get active redirect rule for an entity (if any)
 */
export async function getActiveRuleForEntity(
  entityType: LabelEntityType,
  entityId: string
) {
  const now = new Date();
  
  return prisma.qRRedirectRule.findFirst({
    where: {
      entityType,
      entityId,
      versionId: null,
      active: true,
      OR: [
        { startsAt: null },
        { startsAt: { lte: now } }
      ],
      AND: [
        {
          OR: [
            { endsAt: null },
            { endsAt: { gte: now } }
          ]
        }
      ]
    },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Count active tokens for an entity
 */
export async function countTokensForEntity(
  entityType: LabelEntityType,
  entityId: string
): Promise<number> {
  return prisma.qRToken.count({
    where: {
      entityType,
      entityId,
      status: 'ACTIVE'
    }
  });
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


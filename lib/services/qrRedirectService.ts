// QR REDIRECT SERVICE - Group-based redirect rules for QR tokens
// Allows redirecting entire groups of QR scans (by entityType+entityId or versionId)
// without modifying individual QR tokens. Supports campaigns, recalls, and analytics.
//
// PRECEDENCE ORDER:
// 1. Token-level redirectUrl (QRToken.redirectUrl) - highest priority
// 2. Active QRRedirectRule (by entityType+entityId OR versionId)
// 3. Default entity routing (fallback)

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
  matchedBy: 'entityType+entityId' | 'versionId';
}

// ========================================
// RULE LOOKUP
// ========================================

/**
 * Find an active redirect rule that applies to a given token context.
 * 
 * Checks for rules matching:
 * 1. entityType + entityId combination
 * 2. versionId (if provided)
 * 
 * Only returns rules where:
 * - active = true
 * - startsAt is null OR <= now
 * - endsAt is null OR >= now
 * 
 * @returns The matching rule or null if no active rule applies
 */
export async function findActiveRedirectRule(params: {
  entityType: LabelEntityType;
  entityId: string;
  versionId?: string | null;
}): Promise<RedirectRuleResult | null> {
  const { entityType, entityId, versionId } = params;
  const now = new Date();

  // Build base conditions for active rules within time window
  const baseWhere = {
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
  };

  // First, check for entityType + entityId match (more specific)
  const entityRule = await prisma.qRRedirectRule.findFirst({
    where: {
      ...baseWhere,
      entityType,
      entityId,
      versionId: null // Ensure this is an entity-scoped rule, not version-scoped
    },
    orderBy: { createdAt: 'desc' } // Most recent rule wins
  });

  if (entityRule) {
    return {
      id: entityRule.id,
      redirectUrl: entityRule.redirectUrl,
      reason: entityRule.reason,
      matchedBy: 'entityType+entityId'
    };
  }

  // Second, check for versionId match (if version provided)
  if (versionId) {
    const versionRule = await prisma.qRRedirectRule.findFirst({
      where: {
        ...baseWhere,
        versionId,
        entityType: null, // Ensure this is a version-scoped rule
        entityId: null
      },
      orderBy: { createdAt: 'desc' }
    });

    if (versionRule) {
      return {
        id: versionRule.id,
        redirectUrl: versionRule.redirectUrl,
        reason: versionRule.reason,
        matchedBy: 'versionId'
      };
    }
  }

  return null;
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


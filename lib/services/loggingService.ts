// INTELLIGENT LOGGING SERVICE - MANDATORY FOR ALL ACTIONS
// This service provides field-level diffs, human-readable summaries, and automatic tags

import { prisma } from '@/lib/db/prisma';
import { ActivityEntity } from '@prisma/client';

export interface LogActionParams {
  entityType?: ActivityEntity; // Phase 1: Made nullable for auth logs
  entityId?: string;            // Phase 1: Made nullable for auth logs
  action: string;
  userId?: string;
  ipAddress?: string;           // Phase 1: Added for security tracking
  userAgent?: string;           // Phase 1: Added for security tracking
  summary: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  metadata?: any;               // Phase 1: Renamed from 'details'
  tags?: string[];
}

export interface ActivityFeedFilters {
  entityType?: ActivityEntity;
  entityId?: string;
  userId?: string | null; // null means filter for system actions (no user)
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Log any significant action with intelligent diff tracking
 * MUST be called by all services for every significant operation
 */
export async function logAction({
  entityType,
  entityId,
  action,
  userId,
  ipAddress,
  userAgent,
  summary,
  before,
  after,
  metadata,
  tags = []
}: LogActionParams) {
  // Calculate field-level diff
  const diff: Record<string, [any, any]> = {};
  
  if (before && after) {
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    
    for (const key of allKeys) {
      // Skip internal fields
      if (key === 'updatedAt' || key === 'createdAt') continue;
      
      if (before[key] !== after[key]) {
        diff[key] = [before[key], after[key]];
      }
    }
  }

  // Auto-generate tags based on action and diff
  const autoTags = generateAutoTags(action, diff, metadata);
  const allTags = [...new Set([...tags, ...autoTags])];

  // Validate userId exists before creating log entry to avoid FK constraint violation
  let validUserId = userId;
  if (userId) {
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });
    if (!userExists) {
      // User doesn't exist (possibly stale session after db reseed)
      // Log without userId to avoid FK constraint violation
      validUserId = undefined;
    }
  }

  // Create activity log entry
  await prisma.activityLog.create({
    data: {
      entityType,
      entityId,
      action,
      userId: validUserId,
      ipAddress,
      userAgent,
      summary,
      diff: Object.keys(diff).length > 0 ? diff : undefined,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      tags: allTags
    }
  });
}

/**
 * Generate automatic tags based on action type and changes
 */
function generateAutoTags(
  action: string, 
  diff: Record<string, [any, any]>, 
  details?: any
): string[] {
  const tags: string[] = [];
  
  // Action-based tags
  const lowerAction = action.toLowerCase();
  
  if (lowerAction.includes('shortage')) {
    tags.push('shortage', 'risk');
  }
  
  if (lowerAction.includes('move') || lowerAction.includes('transfer')) {
    tags.push('movement');
  }
  
  if (lowerAction.includes('allocate') || lowerAction.includes('allocation')) {
    tags.push('allocation');
  }
  
  if (lowerAction.includes('qc') || lowerAction.includes('quality')) {
    tags.push('quality');
  }
  
  if (lowerAction.includes('system') || lowerAction.includes('automatic')) {
    tags.push('system');
  }
  
  if (lowerAction.includes('note') || lowerAction.includes('comment')) {
    tags.push('note');
  }
  
  if (lowerAction.includes('create') || lowerAction.includes('add')) {
    tags.push('created');
  }
  
  if (lowerAction.includes('delete') || lowerAction.includes('remove')) {
    tags.push('deleted');
  }
  
  if (lowerAction.includes('scan')) {
    tags.push('qr_scan');
  }
  
  // Diff-based tags
  if (diff.status) {
    tags.push('status_change');
  }
  
  if (diff.quantityOnHand || diff.quantityReserved || diff.currentStockQty) {
    tags.push('quantity_change');
  }
  
  if (diff.locationId) {
    tags.push('movement');
  }
  
  if (diff.makers) {
    tags.push('assignment');
  }
  
  // Details-based tags
  if (details?.shortage || details?.shortageQuantity > 0) {
    tags.push('shortage', 'risk');
  }
  
  if (details?.manual === true) {
    tags.push('manual');
  }
  
  return tags;
}

/**
 * Get activity feed with filters
 */
export async function getActivityFeed(filters: ActivityFeedFilters) {
  const where: any = {};
  
  if (filters.entityType) {
    where.entityType = filters.entityType;
  }
  
  if (filters.entityId) {
    where.entityId = filters.entityId;
  }
  
  // Handle userId filter - null means filter for system actions (no user)
  if (filters.userId !== undefined) {
    if (filters.userId === null) {
      where.userId = null; // System actions have no user
    } else {
      where.userId = filters.userId;
    }
  }
  
  // Tags filter - uses JSON contains for SQLite compatibility
  if (filters.tags && filters.tags.length > 0) {
    // For SQLite, we need to use string_contains on the JSON field
    // This searches for any matching tag in the JSON array
    where.OR = filters.tags.map(tag => ({
      tags: { string_contains: tag }
    }));
  }
  
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  const logs = await prisma.activityLog.findMany({
    where,
    include: { 
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: filters.limit || 50,
    skip: filters.offset || 0
  });

  return logs;
}

/**
 * Get activity count for pagination
 */
export async function getActivityCount(filters: Omit<ActivityFeedFilters, 'limit' | 'offset'>) {
  const where: any = {};
  
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  
  // Handle userId filter - null means filter for system actions
  if (filters.userId !== undefined) {
    if (filters.userId === null) {
      where.userId = null;
    } else {
      where.userId = filters.userId;
    }
  }
  
  // Tags filter for SQLite
  if (filters.tags?.length) {
    where.OR = filters.tags.map(tag => ({
      tags: { string_contains: tag }
    }));
  }
  
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  return await prisma.activityLog.count({ where });
}

/**
 * Get activity for a specific entity
 */
export async function getEntityActivity(
  entityType: ActivityEntity,
  entityId: string,
  limit: number = 50
) {
  return await getActivityFeed({
    entityType,
    entityId,
    limit
  });
}

/**
 * Generate a human-readable summary for common actions
 * This helper can be used by services to create consistent summaries
 */
export function generateSummary(params: {
  userName?: string;
  action: string;
  entityName: string;
  details?: Record<string, any>;
}): string {
  const { userName = 'System', action, entityName, details } = params;
  
  // Common patterns
  const patterns: Record<string, (n: string, e: string, d?: any) => string> = {
    created: (n, e) => `${n} created ${e}`,
    updated: (n, e) => `${n} updated ${e}`,
    deleted: (n, e) => `${n} deleted ${e}`,
    moved: (n, e, d) => `${n} moved ${d?.quantity || ''} ${e} from ${d?.from} to ${d?.to}`,
    allocated: (n, e, d) => `${n} allocated ${d?.quantity || ''} ${e} to order ${d?.orderNumber || ''}`,
    completed: (n, e) => `${n} completed ${e}`,
    submitted: (n, e) => `${n} submitted ${e}`,
    shipped: (n, e, d) => `${n} shipped ${e}${d?.trackingNumber ? ` (${d.trackingNumber})` : ''}`,
    received: (n, e, d) => `${n} received ${d?.quantity || ''} ${e}`,
    adjusted: (n, e, d) => `${n} adjusted ${e} by ${d?.delta || ''}${d?.reason ? ` - ${d.reason}` : ''}`,
  };
  
  const lowerAction = action.toLowerCase();
  
  for (const [key, generator] of Object.entries(patterns)) {
    if (lowerAction.includes(key)) {
      return generator(userName, entityName, details);
    }
  }
  
  // Default format
  return `${userName} ${action} ${entityName}`;
}

/**
 * User Management Logging Helpers (Phase 2)
 */

export interface UserManagementLogParams {
  actorUserId: string;
  targetUserId: string;
  targetEmail?: string;
  metadata?: Record<string, any>;
}

/**
 * Log user creation
 */
export async function logUserCreated(params: UserManagementLogParams & { role: string }) {
  await logAction({
    action: 'USER_CREATED',
    userId: params.actorUserId,
    summary: `Admin created user ${params.targetEmail || params.targetUserId} with role ${params.role}`,
    metadata: {
      targetUserId: params.targetUserId,
      targetEmail: params.targetEmail,
      role: params.role,
      ...params.metadata
    },
    tags: ['user_management', 'created', 'admin_action']
  });
}

/**
 * Log role change
 */
export async function logUserRoleChanged(params: UserManagementLogParams & { oldRole: string; newRole: string }) {
  await logAction({
    action: 'USER_ROLE_CHANGED',
    userId: params.actorUserId,
    summary: `Admin changed ${params.targetEmail || params.targetUserId} role from ${params.oldRole} to ${params.newRole}`,
    metadata: {
      targetUserId: params.targetUserId,
      targetEmail: params.targetEmail,
      oldRole: params.oldRole,
      newRole: params.newRole,
      ...params.metadata
    },
    tags: ['user_management', 'role_change', 'admin_action']
  });
}

/**
 * Log user deactivation
 */
export async function logUserDeactivated(params: UserManagementLogParams) {
  await logAction({
    action: 'USER_DEACTIVATED',
    userId: params.actorUserId,
    summary: `Admin deactivated user ${params.targetEmail || params.targetUserId}`,
    metadata: {
      targetUserId: params.targetUserId,
      targetEmail: params.targetEmail,
      ...params.metadata
    },
    tags: ['user_management', 'deactivated', 'admin_action', 'security']
  });
}

/**
 * Log user reactivation
 */
export async function logUserReactivated(params: UserManagementLogParams) {
  await logAction({
    action: 'USER_REACTIVATED',
    userId: params.actorUserId,
    summary: `Admin reactivated user ${params.targetEmail || params.targetUserId}`,
    metadata: {
      targetUserId: params.targetUserId,
      targetEmail: params.targetEmail,
      ...params.metadata
    },
    tags: ['user_management', 'reactivated', 'admin_action']
  });
}

/**
 * Log password reset
 */
export async function logUserPasswordReset(params: UserManagementLogParams) {
  await logAction({
    action: 'USER_PASSWORD_RESET',
    userId: params.actorUserId,
    summary: `Admin reset password for ${params.targetEmail || params.targetUserId}`,
    metadata: {
      targetUserId: params.targetUserId,
      targetEmail: params.targetEmail,
      ...params.metadata
    },
    tags: ['user_management', 'password_reset', 'admin_action', 'security']
  });
}


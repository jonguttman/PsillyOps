// INTELLIGENT LOGGING SERVICE - MANDATORY FOR ALL ACTIONS
// This service provides field-level diffs, human-readable summaries, and automatic tags

import { prisma } from '@/lib/db/prisma';
import { ActivityEntity } from '@prisma/client';

export interface LogActionParams {
  entityType: ActivityEntity;
  entityId: string;
  action: string;
  userId?: string;
  summary: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  details?: any;
  tags?: string[];
}

export interface ActivityFeedFilters {
  entityType?: ActivityEntity;
  entityId?: string;
  userId?: string;
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
  summary,
  before,
  after,
  details,
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
  const autoTags = generateAutoTags(action, diff, details);
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
      summary,
      diff: Object.keys(diff).length > 0 ? diff : null,
      details: details ? JSON.parse(JSON.stringify(details)) : null,
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
  
  if (filters.userId) {
    where.userId = filters.userId;
  }
  
  if (filters.tags && filters.tags.length > 0) {
    where.tags = { hasSome: filters.tags };
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
  if (filters.userId) where.userId = filters.userId;
  if (filters.tags?.length) where.tags = { hasSome: filters.tags };
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



// API Route: Activity Feed
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getActivityFeed, getActivityCount } from '@/lib/services/loggingService';
import { handleApiError } from '@/lib/utils/errors';
import { ActivityEntity } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    // 1. Validate
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    
    const filters: {
      entityType?: ActivityEntity;
      entityId?: string;
      userId?: string | null;
      tags?: string[];
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {};
    
    // Entity type filter
    if (searchParams.get('entityType')) {
      filters.entityType = searchParams.get('entityType') as ActivityEntity;
    }
    
    // Entity ID filter
    if (searchParams.get('entityId')) {
      filters.entityId = searchParams.get('entityId') || undefined;
    }
    
    // User ID filter - special handling for "system" to find null userId entries
    const userIdParam = searchParams.get('userId');
    if (userIdParam) {
      if (userIdParam === 'system') {
        // Mark as null to filter for system actions (no user)
        filters.userId = null;
      } else {
        filters.userId = userIdParam;
      }
    }
    
    // Tags filter (can be comma-separated or single action category)
    if (searchParams.get('tags')) {
      filters.tags = searchParams.get('tags')!.split(',');
    }

    // Action category filter (UI-friendly) - mapped onto existing tags/entity filters
    // NOTE: We keep the response shape unchanged and do not introduce new logging logic.
    const actionCategory = searchParams.get('actionCategory');
    if (actionCategory) {
      const cat = actionCategory.trim().toLowerCase();
      const mappedTags: string[] = [];

      switch (cat) {
        case 'scan':
          mappedTags.push('scan');
          break;
        case 'print':
          mappedTags.push('print');
          break;
        case 'adjustment':
          // Inventory adjustments (Phase 4.2+) are tagged by adjustment type
          mappedTags.push('adjustment', 'quantity_change', 'manual_correction');
          break;
        case 'production':
        case 'production complete':
        case 'production_complete':
          mappedTags.push('production_complete', 'production');
          break;
        case 'receiving':
        case 'received':
          mappedTags.push('receiving', 'received');
          break;
        case 'redirect':
          mappedTags.push('redirect');
          break;
        case 'purchase':
          // Purchase activity is primarily represented by purchase orders
          filters.entityType = filters.entityType || ('PURCHASE_ORDER' as ActivityEntity);
          break;
        case 'ai':
          mappedTags.push('ai_command');
          break;
        case 'status change':
        case 'status_change':
          mappedTags.push('status_change');
          break;
        default:
          // Allow passing raw tag names as a fallback
          mappedTags.push(cat);
      }

      if (mappedTags.length > 0) {
        filters.tags = Array.from(new Set([...(filters.tags || []), ...mappedTags]));
      }
    }
    
    // Date range filters
    if (searchParams.get('startDate')) {
      filters.startDate = new Date(searchParams.get('startDate')!);
    }
    if (searchParams.get('endDate')) {
      filters.endDate = new Date(searchParams.get('endDate')!);
    }
    
    // Pagination
    if (searchParams.get('limit')) {
      filters.limit = parseInt(searchParams.get('limit')!);
    }
    if (searchParams.get('offset')) {
      filters.offset = parseInt(searchParams.get('offset')!);
    }

    // 2. Call Service
    const [logs, total] = await Promise.all([
      getActivityFeed(filters),
      getActivityCount(filters)
    ]);

    // 3. Return JSON (lightweight - no heavy joins)
    return Response.json({
      logs,
      total,
      limit: filters.limit || 50,
      offset: filters.offset || 0
    });
  } catch (error) {
    return handleApiError(error);
  }
}

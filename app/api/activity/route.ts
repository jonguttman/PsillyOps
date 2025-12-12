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
    
    const filters: any = {};
    
    if (searchParams.get('entityType')) {
      filters.entityType = searchParams.get('entityType') as ActivityEntity;
    }
    if (searchParams.get('entityId')) {
      filters.entityId = searchParams.get('entityId');
    }
    if (searchParams.get('userId')) {
      filters.userId = searchParams.get('userId');
    }
    if (searchParams.get('tags')) {
      filters.tags = searchParams.get('tags')!.split(',');
    }
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

    // 3. Return JSON
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


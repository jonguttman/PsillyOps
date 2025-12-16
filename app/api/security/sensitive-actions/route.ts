// API Route: Security - Sensitive Actions
// Read-only endpoint for monitoring sensitive business operations

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/prisma';
import { ActivityEntity } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    // 1. Validate - Admin only
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Admin access required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const hoursParam = searchParams.get('hours');
    const hours = hoursParam ? parseInt(hoursParam) : 24;

    // Calculate time range
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);

    // 2. Query sensitive actions
    // Sensitive entity types: PRODUCT, MATERIAL, BATCH, INVENTORY
    // Sensitive actions: created, updated, deleted, adjusted
    const sensitiveActions = await prisma.activityLog.findMany({
      where: {
        entityType: {
          in: ['PRODUCT', 'MATERIAL', 'BATCH', 'INVENTORY', 'PRODUCTION_ORDER', 'PURCHASE_ORDER'] as ActivityEntity[]
        },
        createdAt: {
          gte: startDate
        },
        OR: [
          { tags: { string_contains: 'created' } },
          { tags: { string_contains: 'deleted' } },
          { tags: { string_contains: 'status_change' } },
          { tags: { string_contains: 'quantity_change' } },
          { tags: { string_contains: 'adjustment' } }
        ]
      },
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
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });

    // 3. Calculate summary statistics
    const summary = {
      totalActions: sensitiveActions.length,
      byEntityType: sensitiveActions.reduce((acc, action) => {
        const type = action.entityType || 'UNKNOWN';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byUser: sensitiveActions.reduce((acc, action) => {
        if (action.user) {
          const key = action.user.email;
          acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>),
      timeRange: {
        hours,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      }
    };

    // 4. Return JSON
    return Response.json({
      actions: sensitiveActions,
      summary
    });
  } catch (error) {
    return handleApiError(error);
  }
}


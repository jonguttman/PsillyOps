import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { ProductionStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (session.user.role === 'REP') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const showArchived = searchParams.get('showArchived') === 'true';
    const showDismissed = searchParams.get('showDismissed') === 'true';

    // Calculate 15 days ago for auto-hiding completed orders
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    // Build where clause for each status type
    const blockedFilter = showArchived 
      ? { status: ProductionStatus.BLOCKED } // Show all blocked (including archived)
      : { status: ProductionStatus.BLOCKED, archivedAt: null }; // Only non-archived blocked

    const completedFilter = showDismissed
      ? { status: ProductionStatus.COMPLETED } // Show all completed
      : { 
          status: ProductionStatus.COMPLETED, 
          dismissedAt: null,
          completedAt: { gte: fifteenDaysAgo }
        };

    const orders = await prisma.productionOrder.findMany({
      where: {
        status: { not: ProductionStatus.CANCELLED },
        OR: [
          { status: ProductionStatus.PLANNED },
          { status: ProductionStatus.IN_PROGRESS },
          blockedFilter,
          completedFilter
        ]
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        workCenter: { select: { id: true, name: true } },
        batches: {
          select: {
            id: true,
            batchCode: true,
            status: true,
            qcStatus: true,
            actualQuantity: true
          }
        },
        materials: {
          select: {
            shortage: true
          }
        },
        _count: {
          select: { batches: true }
        }
      },
      orderBy: [
        { scheduledDate: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    // Also return counts for stats (always excluding archived/dismissed)
    const blockedCount = await prisma.productionOrder.count({
      where: {
        status: ProductionStatus.BLOCKED,
        archivedAt: null
      }
    });

    return Response.json({
      orders,
      stats: {
        blockedCount
      }
    });
  } catch (error) {
    console.error('Error fetching production orders:', error);
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch production orders' },
      { status: 500 }
    );
  }
}

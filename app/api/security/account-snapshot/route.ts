// API Route: Security - Account Snapshot
// Read-only endpoint for user account overview

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/prisma';

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

    // 2. Query user accounts
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // 3. Get recent activity per user (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivity = await prisma.activityLog.groupBy({
      by: ['userId'],
      where: {
        userId: { not: null },
        createdAt: { gte: sevenDaysAgo }
      },
      _count: true
    });

    const activityMap = recentActivity.reduce((acc, item) => {
      if (item.userId) {
        acc[item.userId] = item._count;
      }
      return acc;
    }, {} as Record<string, number>);

    // 4. Calculate summary
    const summary = {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.active).length,
      inactiveUsers: users.filter(u => !u.active).length,
      byRole: users.reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recentlyActive: Object.keys(activityMap).length
    };

    // 5. Enrich user data with activity count
    const enrichedUsers = users.map(user => ({
      ...user,
      recentActivityCount: activityMap[user.id] || 0
    }));

    // 6. Return JSON
    return Response.json({
      users: enrichedUsers,
      summary
    });
  } catch (error) {
    return handleApiError(error);
  }
}


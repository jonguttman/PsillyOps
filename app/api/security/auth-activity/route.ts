// API Route: Security - Auth Activity
// Read-only endpoint for auth event monitoring

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

    const { searchParams } = new URL(req.url);
    const hoursParam = searchParams.get('hours');
    const hours = hoursParam ? parseInt(hoursParam) : 24;

    // Calculate time range
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);

    // 2. Query auth events
    const authEvents = await prisma.activityLog.findMany({
      where: {
        action: {
          in: ['AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILURE', 'AUTH_LOGOUT', 'AUTH_SESSION_CREATED']
        },
        createdAt: {
          gte: startDate
        }
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
      totalEvents: authEvents.length,
      successfulLogins: authEvents.filter(e => e.action === 'AUTH_LOGIN_SUCCESS').length,
      failedLogins: authEvents.filter(e => e.action === 'AUTH_LOGIN_FAILURE').length,
      logouts: authEvents.filter(e => e.action === 'AUTH_LOGOUT').length,
      sessionsCreated: authEvents.filter(e => e.action === 'AUTH_SESSION_CREATED').length,
      uniqueUsers: new Set(authEvents.filter(e => e.userId).map(e => e.userId)).size,
      uniqueIPs: new Set(authEvents.filter(e => e.ipAddress).map(e => e.ipAddress)).size,
      timeRange: {
        hours,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      }
    };

    // 4. Return JSON
    return Response.json({
      events: authEvents,
      summary
    });
  } catch (error) {
    return handleApiError(error);
  }
}


// API Route: Security - System Errors
// Read-only endpoint for monitoring system-level errors and anomalies

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

    // 2. Query system-level events
    // Look for: auth failures, shortage/risk tags, system errors
    const systemEvents = await prisma.activityLog.findMany({
      where: {
        createdAt: {
          gte: startDate
        },
        OR: [
          { action: 'AUTH_LOGIN_FAILURE' },
          { tags: { string_contains: 'shortage' } },
          { tags: { string_contains: 'risk' } },
          { tags: { string_contains: 'error' } },
          { tags: { string_contains: 'failed' } }
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
      totalEvents: systemEvents.length,
      authFailures: systemEvents.filter(e => e.action === 'AUTH_LOGIN_FAILURE').length,
      shortageEvents: systemEvents.filter(e => 
        e.tags && JSON.stringify(e.tags).includes('shortage')
      ).length,
      riskEvents: systemEvents.filter(e => 
        e.tags && JSON.stringify(e.tags).includes('risk')
      ).length,
      errorEvents: systemEvents.filter(e => 
        e.tags && (JSON.stringify(e.tags).includes('error') || JSON.stringify(e.tags).includes('failed'))
      ).length,
      timeRange: {
        hours,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      }
    };

    // 4. Return JSON
    return Response.json({
      events: systemEvents,
      summary
    });
  } catch (error) {
    return handleApiError(error);
  }
}


// API Route: Production Runs - Attention Summary (dashboard)
// STRICT LAYERING: Validate → Query minimal data → Compute health → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/prisma';
import { computeRunHealth } from '@/lib/services/productionRunService';

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'].includes(session.user.role)) {
      return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 });
    }

    const runs = await prisma.productionRun.findMany({
      where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } },
      take: 200,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        steps: {
          select: { status: true, required: true, startedAt: true },
        },
      },
    });

    let requiredSkips = 0;
    let stalled = 0;
    let blocked = 0;

    for (const r of runs) {
      const health = computeRunHealth({
        runStatus: r.status as any,
        steps: r.steps.map((s) => ({ status: s.status as any, required: s.required, startedAt: s.startedAt })),
      });
      if (health.hasRequiredSkips) requiredSkips += 1;
      if (health.hasStalledStep) stalled += 1;
      if (health.isBlocked) blocked += 1;
    }

    return Response.json({
      ok: true,
      requiredSkips,
      stalled,
      blocked,
      activeRuns: runs.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}


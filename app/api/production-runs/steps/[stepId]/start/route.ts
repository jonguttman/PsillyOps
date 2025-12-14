// API Route: Production Run Step - Start
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { startStep } from '@/lib/services/productionRunService';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ stepId: string }> }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'].includes(session.user.role)) {
      return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 });
    }

    const { stepId } = await ctx.params;
    const result = await startStep(stepId, session.user.id, session.user.role);

    return Response.json({
      ok: true,
      runId: result.runId,
      stepId: result.stepId,
      status: result.status,
      runStatus: result.runStatus,
      timestamps: result.timestamps,
    });
  } catch (error) {
    return handleApiError(error);
  }
}


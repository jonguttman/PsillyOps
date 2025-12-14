// API Route: My Active Production Runs
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { getMyActiveProductionRuns } from '@/lib/services/productionRunService';

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'].includes(session.user.role)) {
      return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 });
    }

    const runs = await getMyActiveProductionRuns(session.user.id);

    return Response.json({ ok: true, runs });
  } catch (error) {
    return handleApiError(error);
  }
}


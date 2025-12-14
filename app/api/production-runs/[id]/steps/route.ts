// API Route: Production Run - Step Overrides (Add)
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { addAdhocRunStep } from '@/lib/services/productionRunService';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }
    if (!['ADMIN', 'PRODUCTION'].includes(session.user.role)) {
      return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 });
    }

    const { id: runId } = await ctx.params;
    const body = (await req.json()) as unknown;
    const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    const label = typeof rec?.label === 'string' ? rec.label : '';
    const required = typeof rec?.required === 'boolean' ? rec.required : true;

    const run = await addAdhocRunStep({ runId, label, required, userId: session.user.id });
    return Response.json({ ok: true, run });
  } catch (error) {
    return handleApiError(error);
  }
}


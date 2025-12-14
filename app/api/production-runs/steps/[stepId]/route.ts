// API Route: Production Run Step Override - Update/Delete (pre-start only)
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { updateRunStepOverride, deleteRunStep } from '@/lib/services/productionRunService';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ stepId: string }> }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }
    if (!['ADMIN', 'PRODUCTION'].includes(session.user.role)) {
      return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 });
    }

    const { stepId } = await ctx.params;
    const body = (await req.json()) as unknown;
    const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;

    const label = typeof rec?.label === 'string' ? rec.label : undefined;
    const required = typeof rec?.required === 'boolean' ? rec.required : undefined;

    const run = await updateRunStepOverride({ stepId, label, required, userId: session.user.id });
    return Response.json({ ok: true, run });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ stepId: string }> }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }
    if (!['ADMIN', 'PRODUCTION'].includes(session.user.role)) {
      return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 });
    }

    const { stepId } = await ctx.params;
    const run = await deleteRunStep({ stepId, userId: session.user.id });
    return Response.json({ ok: true, run });
  } catch (error) {
    return handleApiError(error);
  }
}


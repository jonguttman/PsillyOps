// API Route: Product Step Templates - Reorder
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { reorderProductStepTemplates } from '@/lib/services/productionStepTemplateService';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    if (!['ADMIN', 'PRODUCTION'].includes(session.user.role)) {
      return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 });
    }

    const { id: productId } = await ctx.params;
    const body = (await req.json()) as unknown;
    const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    const orderedStepIds = Array.isArray(rec?.orderedStepIds)
      ? (rec?.orderedStepIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    const steps = await reorderProductStepTemplates({
      productId,
      orderedStepIds,
      userId: session.user.id,
    });

    return Response.json({ ok: true, steps });
  } catch (error) {
    return handleApiError(error);
  }
}


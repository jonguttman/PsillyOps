// API Route: Product Production Step Templates
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import {
  listProductStepTemplates,
  createProductStepTemplate,
} from '@/lib/services/productionStepTemplateService';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE'].includes(session.user.role)) {
      return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 });
    }

    const { id: productId } = await ctx.params;
    const steps = await listProductStepTemplates(productId);
    return Response.json({ ok: true, steps });
  } catch (error) {
    return handleApiError(error);
  }
}

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

    const key = typeof rec?.key === 'string' ? rec.key : '';
    const label = typeof rec?.label === 'string' ? rec.label : '';
    const required = typeof rec?.required === 'boolean' ? rec.required : true;

    const created = await createProductStepTemplate({
      productId,
      key,
      label,
      required,
      userId: session.user.id,
    });

    return Response.json({ ok: true, step: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}


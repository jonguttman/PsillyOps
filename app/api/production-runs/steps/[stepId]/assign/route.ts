// API Route: Production Run Step - Admin assign/reassign/unassign
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { adminAssignRunStep } from '@/lib/services/productionRunService';

export async function POST(req: NextRequest, ctx: { params: Promise<{ stepId: string }> }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return Response.json({ code: 'FORBIDDEN', message: 'Admin only' }, { status: 403 });
    }

    const { stepId } = await ctx.params;
    const body = (await req.json()) as unknown;
    const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    const assignedToUserId =
      rec && (typeof rec.assignedToUserId === 'string' || rec.assignedToUserId === null)
        ? (rec.assignedToUserId as string | null)
        : null;

    const result = await adminAssignRunStep({
      stepId,
      assignedToUserId,
      actorUserId: session.user.id,
      actorRole: session.user.role,
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}


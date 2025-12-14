// API Route: Production Run Detail
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { getProductionRun } from '@/lib/services/productionRunService';
import { getBaseUrl } from '@/lib/services/qrTokenService';
import { ProductionStepStatus } from '@prisma/client';
import { computeRunHealth } from '@/lib/services/productionRunService';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'].includes(session.user.role)) {
      return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await ctx.params;
    const run = await getProductionRun(id);

    const inProgress = run.steps.find((s) => s.status === ProductionStepStatus.IN_PROGRESS);
    const nextPending = run.steps.find((s) => s.status === ProductionStepStatus.PENDING);
    const current = inProgress || nextPending || null;

    const baseUrl = getBaseUrl();
    const qrUrl = run.qrToken?.token ? `${baseUrl}/qr/${run.qrToken.token}` : null;
    const health = computeRunHealth({
      runStatus: run.status,
      steps: run.steps.map((s) => ({ status: s.status, required: s.required, startedAt: s.startedAt })),
    });

    return Response.json({
      ok: true,
      run: {
        id: run.id,
        product: run.product,
        productId: run.productId,
        quantity: run.quantity,
        status: run.status,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        qr: run.qrToken
          ? {
              id: run.qrToken.id,
              token: run.qrToken.token,
              status: run.qrToken.status,
              url: qrUrl,
            }
          : null,
        steps: run.steps.map((s) => ({
          id: s.id,
          templateKey: s.templateKey,
          label: s.label,
          order: s.order,
          required: s.required,
          status: s.status,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          skippedAt: s.skippedAt,
          skipReason: s.skipReason,
          performedById: s.performedById,
          assignedToUserId: (s as unknown as { assignedToUserId?: string | null }).assignedToUserId ?? null,
        })),
        currentStep: current
          ? {
              stepId: current.id,
              stepKey: current.templateKey,
              stepLabel: current.label,
              status: current.status,
              order: current.order,
            }
          : null,
        health,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}


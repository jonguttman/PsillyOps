// API Route: Production Runs - Create
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { createProductionRun } from '@/lib/services/productionRunService';
import { getBaseUrl } from '@/lib/services/qrTokenService';
import { prisma } from '@/lib/db/prisma';
import { computeRunHealth } from '@/lib/services/productionRunService';
import { ProductionStepStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'].includes(session.user.role)) {
      return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;

    const runs = await prisma.productionRun.findMany({
      take: Number.isFinite(limit) ? Math.min(200, Math.max(1, Math.trunc(limit))) : 50,
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        steps: { orderBy: { order: 'asc' } },
        qrToken: { select: { token: true } },
      },
    });

    const baseUrl = getBaseUrl();

    const shaped = runs.map((r) => {
      const inProgress = r.steps.find((s) => s.status === ProductionStepStatus.IN_PROGRESS);
      const nextPending = r.steps.find((s) => s.status === ProductionStepStatus.PENDING);
      const current = inProgress || nextPending || null;

      const health = computeRunHealth({
        runStatus: r.status,
        steps: r.steps.map((s) => ({ status: s.status, required: s.required, startedAt: s.startedAt })),
      });

      return {
        id: r.id,
        product: r.product,
        productId: r.productId,
        quantity: r.quantity,
        status: r.status,
        createdAt: r.createdAt,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        qrUrl: r.qrToken?.token ? `${baseUrl}/qr/${r.qrToken.token}` : null,
        currentStep: current
          ? { stepId: current.id, stepKey: current.templateKey, stepLabel: current.label, status: current.status, order: current.order }
          : null,
        health,
      };
    });

    return Response.json({ ok: true, runs: shaped });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'].includes(session.user.role)) {
      return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 });
    }

    const body = (await req.json()) as unknown;
    if (!body || typeof body !== 'object') {
      return Response.json({ code: 'VALIDATION_ERROR', message: 'Invalid JSON body' }, { status: 400 });
    }

    const rec = body as Record<string, unknown>;
    const productId = typeof rec.productId === 'string' ? rec.productId : '';
    const quantityRaw = rec.quantity;
    const quantity =
      typeof quantityRaw === 'number'
        ? quantityRaw
        : typeof quantityRaw === 'string'
          ? Number(quantityRaw)
          : NaN;

    if (!productId) {
      return Response.json({ code: 'VALIDATION_ERROR', message: 'productId is required' }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return Response.json({ code: 'VALIDATION_ERROR', message: 'quantity must be a positive integer' }, { status: 400 });
    }

    const created = await createProductionRun({
      productId,
      quantity,
      userId: session.user.id,
    });

    const baseUrl = getBaseUrl();
    const qrUrl = `${baseUrl}/qr/${created.qrToken}`;

    return Response.json(
      {
        ok: true,
        runId: created.id,
        qrTokenId: created.qrTokenId,
        qrToken: created.qrToken,
        qrUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}


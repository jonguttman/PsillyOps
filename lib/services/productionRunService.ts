// PRODUCTION RUN SERVICE (Phase 5.1)
// Canonical production runs with immutable instantiated steps and audit logging.
// No UI/multi-tasking yet - this phase is data + service + audit only.

import { prisma } from '@/lib/db/prisma';
import { logAction } from '@/lib/services/loggingService';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { ActivityEntity, LabelEntityType, ProductionRunStatus, ProductionStepStatus } from '@prisma/client';
import { generateToken } from '@/lib/services/qrTokenService';

export function computeRunHealth(params: {
  runStatus: ProductionRunStatus;
  steps: Array<{
    status: ProductionStepStatus;
    required: boolean;
    startedAt: Date | null;
  }>;
  stallHours?: number;
  now?: Date;
}) {
  const { runStatus, steps, stallHours = 4, now = new Date() } = params;

  const hasRequiredSkips = steps.some((s) => s.required && s.status === ProductionStepStatus.SKIPPED);

  const stallMs = stallHours * 60 * 60 * 1000;
  const hasStalledStep = steps.some((s) => {
    if (s.status !== ProductionStepStatus.IN_PROGRESS) return false;
    if (!s.startedAt) return false;
    return now.getTime() - s.startedAt.getTime() > stallMs;
  });

  const anyPending = steps.some((s) => s.status === ProductionStepStatus.PENDING);
  const anyInProgress = steps.some((s) => s.status === ProductionStepStatus.IN_PROGRESS);
  const allDone = steps.length > 0 && steps.every((s) => s.status === ProductionStepStatus.COMPLETED || s.status === ProductionStepStatus.SKIPPED);

  // "Blocked" is a signal for abnormal or stuck runs: not completed/cancelled, but nothing actionable remains.
  const isBlocked =
    (runStatus === ProductionRunStatus.PLANNED || runStatus === ProductionRunStatus.IN_PROGRESS) &&
    !anyPending &&
    !anyInProgress &&
    !allDone;

  return {
    hasRequiredSkips,
    hasStalledStep,
    isBlocked,
  };
}

function snapshotSteps(steps: Array<{
  id: string;
  templateKey: string;
  label: string;
  order: number;
  required: boolean;
  status: ProductionStepStatus;
}>) {
  return steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      id: s.id,
      stepKey: s.templateKey,
      stepLabel: s.label,
      order: s.order,
      required: s.required,
      status: s.status,
    }));
}

async function assertRunEditableForStepOverrides(runId: string) {
  const run = await prisma.productionRun.findUnique({
    where: { id: runId },
    include: {
      steps: { orderBy: { order: 'asc' }, select: { id: true, templateKey: true, label: true, order: true, required: true, status: true } },
    },
  });
  if (!run) throw new AppError(ErrorCodes.NOT_FOUND, 'Production run not found');

  const anyStarted = run.steps.some((s) => s.status !== ProductionStepStatus.PENDING);
  if (anyStarted || run.status !== ProductionRunStatus.PLANNED) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'This run can no longer be edited because production has already started.'
    );
  }

  return run;
}

export async function createProductionRun(params: {
  productId: string;
  quantity: number;
  userId?: string;
}) {
  const { productId, quantity, userId } = params;

  if (!productId) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'productId is required');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'quantity must be a positive integer');
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, sku: true, active: true },
  });

  if (!product || !product.active) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
  }

  const templates = await prisma.productionStepTemplate.findMany({
    where: { productId },
    orderBy: { order: 'asc' },
  });

  if (templates.length === 0) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `No production step template exists for product "${product.name}" (${product.sku}).`
    );
  }

  // Step order integrity (5.1 revision / Phase 5.2 pre-req)
  // Ensure order values are finite integers, unique, and gap-free.
  const orders = templates.map((t) => t.order);
  const allInt = orders.every((o) => Number.isFinite(o) && Number.isInteger(o));
  const uniqueCount = new Set(orders).size;
  let gapFree = true;
  if (orders.length > 0) {
    const base = orders[0];
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== base + i) {
        gapFree = false;
        break;
      }
    }
  }

  if (!allInt || uniqueCount !== orders.length || !gapFree) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `Invalid ProductionStepTemplate ordering for product ${productId}. Duplicate or missing order values.`
    );
  }

  const stepCount = templates.length;

  const result = await prisma.$transaction(async (tx) => {
    const run = await tx.productionRun.create({
      data: {
        productId,
        quantity,
        status: ProductionRunStatus.PLANNED,
        createdById: userId || null,
      },
      select: { id: true, productId: true, quantity: true, status: true, createdAt: true },
    });

    await tx.productionRunStep.createMany({
      data: templates.map((t) => ({
        productionRunId: run.id,
        templateKey: t.key,
        label: t.label,
        order: t.order,
        required: t.required,
        status: ProductionStepStatus.PENDING,
      })),
    });

    const tokenValue = generateToken();
    const qrToken = await tx.qRToken.create({
      data: {
        token: tokenValue,
        status: 'ACTIVE',
        entityType: LabelEntityType.CUSTOM,
        entityId: run.id,
        redirectUrl: `/production-runs/${run.id}`,
        createdByUserId: userId || null,
      },
      select: { id: true, token: true },
    });

    await tx.productionRun.update({
      where: { id: run.id },
      data: { qrTokenId: qrToken.id },
    });

    return { run, qrToken };
  });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_RUN,
    entityId: result.run.id,
    action: 'production_run_created',
    userId,
    summary: `Production run created: ${product.name} × ${quantity} (${stepCount} steps)`,
    details: {
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      quantity,
      stepCount,
      qrTokenId: result.qrToken.id,
      qrToken: result.qrToken.token,
    },
    tags: ['production', 'run', 'create'],
  });

  return {
    id: result.run.id,
    productId: product.id,
    productName: product.name,
    quantity: result.run.quantity,
    status: result.run.status,
    qrTokenId: result.qrToken.id,
    qrToken: result.qrToken.token,
    createdAt: result.run.createdAt,
    stepCount,
  };
}

export async function startStep(stepId: string, userId?: string, userRole?: string) {
  if (!stepId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'stepId is required');

  const actorRole = userRole;

  const result = await prisma.$transaction(async (tx) => {
    const step = await tx.productionRunStep.findUnique({
      where: { id: stepId },
      select: { id: true, productionRunId: true, status: true, templateKey: true, label: true, required: true, order: true, assignedToUserId: true },
    });

    if (!step) throw new AppError(ErrorCodes.NOT_FOUND, 'Step not found');
    if (step.status !== ProductionStepStatus.PENDING) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Step is not PENDING (current: ${step.status})`);
    }

    // Assignment enforcement (Phase 5.3)
    if (actorRole !== 'ADMIN') {
      if (!step.assignedToUserId) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'This step must be claimed before it can be started.');
      }
      if (userId && step.assignedToUserId !== userId) {
        throw new AppError(ErrorCodes.FORBIDDEN, 'You are not assigned to this step.');
      }
    }

    const run = await tx.productionRun.findUnique({
      where: { id: step.productionRunId },
      select: { id: true, status: true, startedAt: true },
    });
    if (!run) throw new AppError(ErrorCodes.NOT_FOUND, 'Production run not found');
    if (run.status === ProductionRunStatus.CANCELLED || run.status === ProductionRunStatus.COMPLETED) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Cannot start steps on a ${run.status} run`);
    }

    const existingInProgress = await tx.productionRunStep.findFirst({
      where: { productionRunId: step.productionRunId, status: ProductionStepStatus.IN_PROGRESS },
      select: { id: true, label: true, order: true },
    });
    if (existingInProgress) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Only one step can be IN_PROGRESS. Step ${existingInProgress.order} (${existingInProgress.label}) is already in progress.`
      );
    }

    const now = new Date();

    await tx.productionRun.update({
      where: { id: step.productionRunId },
      data: {
        status: ProductionRunStatus.IN_PROGRESS,
        startedAt: run.startedAt || now,
      },
    });

    await tx.productionRunStep.update({
      where: { id: stepId },
      data: {
        status: ProductionStepStatus.IN_PROGRESS,
        startedAt: now,
        performedById: userId || null,
      },
    });

    const [updatedStep, updatedRun] = await Promise.all([
      tx.productionRunStep.findUnique({
        where: { id: stepId },
        select: {
          id: true,
          productionRunId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          skippedAt: true,
          skipReason: true,
          templateKey: true,
          label: true,
          order: true,
          required: true,
        },
      }),
      tx.productionRun.findUnique({
        where: { id: step.productionRunId },
        select: { id: true, status: true, startedAt: true, completedAt: true },
      }),
    ]);

    if (!updatedStep || !updatedRun) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Production run state not found after update');
    }

    return {
      runId: step.productionRunId,
      stepId: stepId,
      stepKey: step.templateKey,
      stepLabel: step.label,
      fromStatus: step.status,
      toStatus: ProductionStepStatus.IN_PROGRESS,
      updatedStep,
      updatedRun,
    };
  });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_RUN,
    entityId: result.runId,
    action: 'production_step_started',
    userId,
    summary: `Production step started: ${result.stepLabel}`,
    before: { status: result.fromStatus },
    after: { status: result.toStatus },
    details: {
      stepKey: result.stepKey,
      stepLabel: result.stepLabel,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
    },
    tags: ['production', 'step', 'start'],
  });

  return {
    success: true,
    runId: result.runId,
    stepId: result.stepId,
    status: result.updatedStep.status,
    runStatus: result.updatedRun.status,
    timestamps: {
      stepStartedAt: result.updatedStep.startedAt,
      stepCompletedAt: result.updatedStep.completedAt,
      stepSkippedAt: result.updatedStep.skippedAt,
      runStartedAt: result.updatedRun.startedAt,
      runCompletedAt: result.updatedRun.completedAt,
    },
  };
}

/**
 * Stop (pause) a step that is currently IN_PROGRESS.
 * Since Phase 5.1 has no PAUSED status, this returns the step to PENDING.
 */
export async function stopStep(stepId: string, userId?: string, userRole?: string) {
  if (!stepId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'stepId is required');

  const actorRole = userRole;

  const result = await prisma.$transaction(async (tx) => {
    const step = await tx.productionRunStep.findUnique({
      where: { id: stepId },
      select: { id: true, productionRunId: true, status: true, templateKey: true, label: true, assignedToUserId: true },
    });
    if (!step) throw new AppError(ErrorCodes.NOT_FOUND, 'Step not found');
    if (step.status !== ProductionStepStatus.IN_PROGRESS) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Step is not IN_PROGRESS (current: ${step.status})`);
    }

    // Assignment enforcement (Phase 5.3)
    if (actorRole !== 'ADMIN') {
      if (!step.assignedToUserId) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'This step must be claimed before it can be stopped.');
      }
      if (userId && step.assignedToUserId !== userId) {
        throw new AppError(ErrorCodes.FORBIDDEN, 'You are not assigned to this step.');
      }
    }

    const run = await tx.productionRun.findUnique({
      where: { id: step.productionRunId },
      select: { id: true, status: true },
    });
    if (!run) throw new AppError(ErrorCodes.NOT_FOUND, 'Production run not found');
    if (run.status === ProductionRunStatus.CANCELLED || run.status === ProductionRunStatus.COMPLETED) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Cannot stop steps on a ${run.status} run`);
    }

    await tx.productionRunStep.update({
      where: { id: stepId },
      data: {
        status: ProductionStepStatus.PENDING,
        startedAt: null,
        performedById: userId || null,
      },
    });

    const [updatedStep, updatedRun] = await Promise.all([
      tx.productionRunStep.findUnique({
        where: { id: stepId },
        select: {
          id: true,
          productionRunId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          skippedAt: true,
          skipReason: true,
          templateKey: true,
          label: true,
          order: true,
          required: true,
        },
      }),
      tx.productionRun.findUnique({
        where: { id: step.productionRunId },
        select: { id: true, status: true, startedAt: true, completedAt: true },
      }),
    ]);

    if (!updatedStep || !updatedRun) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Production run state not found after update');
    }

    return {
      runId: step.productionRunId,
      stepId,
      stepKey: step.templateKey,
      stepLabel: step.label,
      fromStatus: step.status,
      toStatus: ProductionStepStatus.PENDING,
      updatedStep,
      updatedRun,
    };
  });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_RUN,
    entityId: result.runId,
    action: 'production_step_stopped',
    userId,
    summary: `Production step stopped: ${result.stepLabel}`,
    before: { status: result.fromStatus },
    after: { status: result.toStatus },
    details: {
      stepKey: result.stepKey,
      stepLabel: result.stepLabel,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
    },
    tags: ['production', 'step', 'stop'],
  });

  return {
    success: true,
    runId: result.runId,
    stepId: result.stepId,
    status: result.updatedStep.status,
    runStatus: result.updatedRun.status,
    timestamps: {
      stepStartedAt: result.updatedStep.startedAt,
      stepCompletedAt: result.updatedStep.completedAt,
      stepSkippedAt: result.updatedStep.skippedAt,
      runStartedAt: result.updatedRun.startedAt,
      runCompletedAt: result.updatedRun.completedAt,
    },
  };
}

export async function completeStep(stepId: string, userId?: string, userRole?: string) {
  if (!stepId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'stepId is required');

  const actorRole = userRole;

  const result = await prisma.$transaction(async (tx) => {
    const step = await tx.productionRunStep.findUnique({
      where: { id: stepId },
      select: { id: true, productionRunId: true, status: true, templateKey: true, label: true, assignedToUserId: true },
    });
    if (!step) throw new AppError(ErrorCodes.NOT_FOUND, 'Step not found');
    if (step.status !== ProductionStepStatus.IN_PROGRESS) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Step is not IN_PROGRESS (current: ${step.status})`);
    }

    // Assignment enforcement (Phase 5.3)
    if (actorRole !== 'ADMIN') {
      if (!step.assignedToUserId) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'This step must be claimed before it can be completed.');
      }
      if (userId && step.assignedToUserId !== userId) {
        throw new AppError(ErrorCodes.FORBIDDEN, 'You are not assigned to this step.');
      }
    }

    const run = await tx.productionRun.findUnique({
      where: { id: step.productionRunId },
      select: { id: true, status: true },
    });
    if (!run) throw new AppError(ErrorCodes.NOT_FOUND, 'Production run not found');
    if (run.status === ProductionRunStatus.CANCELLED || run.status === ProductionRunStatus.COMPLETED) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Cannot complete steps on a ${run.status} run`);
    }

    const now = new Date();

    await tx.productionRunStep.update({
      where: { id: stepId },
      data: {
        status: ProductionStepStatus.COMPLETED,
        completedAt: now,
        performedById: userId || null,
      },
    });

    // If all steps are done (COMPLETED or SKIPPED), complete the run.
    const remaining = await tx.productionRunStep.count({
      where: {
        productionRunId: step.productionRunId,
        status: { in: [ProductionStepStatus.PENDING, ProductionStepStatus.IN_PROGRESS] },
      },
    });

    if (remaining === 0) {
      await tx.productionRun.update({
        where: { id: step.productionRunId },
        data: {
          status: ProductionRunStatus.COMPLETED,
          completedAt: now,
        },
      });
    }

    const [updatedStep, updatedRun] = await Promise.all([
      tx.productionRunStep.findUnique({
        where: { id: stepId },
        select: {
          id: true,
          productionRunId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          skippedAt: true,
          skipReason: true,
          templateKey: true,
          label: true,
          order: true,
          required: true,
        },
      }),
      tx.productionRun.findUnique({
        where: { id: step.productionRunId },
        select: { id: true, status: true, startedAt: true, completedAt: true },
      }),
    ]);

    if (!updatedStep || !updatedRun) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Production run state not found after update');
    }

    return {
      runId: step.productionRunId,
      stepId,
      stepKey: step.templateKey,
      stepLabel: step.label,
      fromStatus: step.status,
      toStatus: ProductionStepStatus.COMPLETED,
      runCompleted: remaining === 0,
      updatedStep,
      updatedRun,
    };
  });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_RUN,
    entityId: result.runId,
    action: 'production_step_completed',
    userId,
    summary: `Production step completed: ${result.stepLabel}`,
    before: { status: result.fromStatus },
    after: { status: result.toStatus },
    details: {
      stepKey: result.stepKey,
      stepLabel: result.stepLabel,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
    },
    tags: ['production', 'step', 'complete'],
  });

  return {
    success: true,
    runId: result.runId,
    stepId: result.stepId,
    status: result.updatedStep.status,
    runStatus: result.updatedRun.status,
    runCompleted: result.runCompleted,
    timestamps: {
      stepStartedAt: result.updatedStep.startedAt,
      stepCompletedAt: result.updatedStep.completedAt,
      stepSkippedAt: result.updatedStep.skippedAt,
      runStartedAt: result.updatedRun.startedAt,
      runCompletedAt: result.updatedRun.completedAt,
    },
  };
}

export async function skipStep(stepId: string, reason: string, userId?: string, userRole?: string) {
  if (!stepId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'stepId is required');

  const actorRole = userRole;
  const trimmedReason = (reason || '').trim();

  const result = await prisma.$transaction(async (tx) => {
    const step = await tx.productionRunStep.findUnique({
      where: { id: stepId },
      select: { id: true, productionRunId: true, status: true, templateKey: true, label: true, required: true, assignedToUserId: true },
    });
    if (!step) throw new AppError(ErrorCodes.NOT_FOUND, 'Step not found');
    if (step.status === ProductionStepStatus.COMPLETED) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Cannot skip a COMPLETED step');
    }

    // Assignment enforcement (Phase 5.3)
    if (actorRole !== 'ADMIN') {
      if (!step.assignedToUserId) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'This step must be claimed before it can be skipped.');
      }
      if (userId && step.assignedToUserId !== userId) {
        throw new AppError(ErrorCodes.FORBIDDEN, 'You are not assigned to this step.');
      }
    }
    if (step.required && trimmedReason.length === 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Skipping a required step requires a reason');
    }

    const run = await tx.productionRun.findUnique({
      where: { id: step.productionRunId },
      select: { id: true, status: true },
    });
    if (!run) throw new AppError(ErrorCodes.NOT_FOUND, 'Production run not found');
    if (run.status === ProductionRunStatus.CANCELLED || run.status === ProductionRunStatus.COMPLETED) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Cannot skip steps on a ${run.status} run`);
    }

    const now = new Date();

    await tx.productionRunStep.update({
      where: { id: stepId },
      data: {
        status: ProductionStepStatus.SKIPPED,
        skippedAt: now,
        skipReason: trimmedReason.length > 0 ? trimmedReason : null,
        performedById: userId || null,
      },
    });

    const [updatedStep, updatedRun] = await Promise.all([
      tx.productionRunStep.findUnique({
        where: { id: stepId },
        select: {
          id: true,
          productionRunId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          skippedAt: true,
          skipReason: true,
          templateKey: true,
          label: true,
          order: true,
          required: true,
        },
      }),
      tx.productionRun.findUnique({
        where: { id: step.productionRunId },
        select: { id: true, status: true, startedAt: true, completedAt: true },
      }),
    ]);

    if (!updatedStep || !updatedRun) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Production run state not found after update');
    }

    return {
      runId: step.productionRunId,
      stepId,
      stepKey: step.templateKey,
      stepLabel: step.label,
      fromStatus: step.status,
      toStatus: ProductionStepStatus.SKIPPED,
      skipReason: trimmedReason || undefined,
      updatedStep,
      updatedRun,
    };
  });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_RUN,
    entityId: result.runId,
    action: 'production_step_skipped',
    userId,
    summary: `Production step skipped: ${result.stepLabel}${result.skipReason ? ` — ${result.skipReason}` : ''}`,
    before: { status: result.fromStatus },
    after: { status: result.toStatus },
    details: {
      stepKey: result.stepKey,
      stepLabel: result.stepLabel,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
      skipReason: result.skipReason,
    },
    tags: ['production', 'step', 'skip'],
  });

  return {
    success: true,
    runId: result.runId,
    stepId: result.stepId,
    status: result.updatedStep.status,
    runStatus: result.updatedRun.status,
    timestamps: {
      stepStartedAt: result.updatedStep.startedAt,
      stepCompletedAt: result.updatedStep.completedAt,
      stepSkippedAt: result.updatedStep.skippedAt,
      runStartedAt: result.updatedRun.startedAt,
      runCompletedAt: result.updatedRun.completedAt,
    },
  };
}

export async function getProductionRun(runId: string) {
  if (!runId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'runId is required');

  const run = await prisma.productionRun.findUnique({
    where: { id: runId },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      qrToken: { select: { id: true, token: true, status: true } },
      steps: { orderBy: { order: 'asc' } },
    },
  });

  if (!run) throw new AppError(ErrorCodes.NOT_FOUND, 'Production run not found');
  return run;
}

export async function addAdhocRunStep(params: {
  runId: string;
  label: string;
  required: boolean;
  userId?: string;
}) {
  const { runId, label, required, userId } = params;
  const cleanLabel = (label || '').trim();
  if (!runId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'runId is required');
  if (!cleanLabel) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'label is required');

  const beforeRun = await assertRunEditableForStepOverrides(runId);
  const before = snapshotSteps(beforeRun.steps);

  const updated = await prisma.$transaction(async (tx) => {
    const steps = await tx.productionRunStep.findMany({
      where: { productionRunId: runId },
      orderBy: { order: 'asc' },
      select: { order: true },
    });
    const nextOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.order)) + 1 : 1;
    const stepKey = `adhoc_${Math.random().toString(36).slice(2, 10)}`;

    await tx.productionRunStep.create({
      data: {
        productionRunId: runId,
        templateKey: stepKey,
        label: cleanLabel,
        order: nextOrder,
        required: !!required,
        status: ProductionStepStatus.PENDING,
      },
    });

    const run = await tx.productionRun.findUnique({
      where: { id: runId },
      include: {
        steps: { orderBy: { order: 'asc' }, select: { id: true, templateKey: true, label: true, order: true, required: true, status: true } },
      },
    });
    if (!run) throw new AppError(ErrorCodes.NOT_FOUND, 'Production run not found');
    return run;
  });

  const after = snapshotSteps(updated.steps);

  await logAction({
    entityType: ActivityEntity.PRODUCTION_RUN,
    entityId: runId,
    action: 'production_run_steps_modified',
    userId,
    summary: `Added step "${cleanLabel}" to production run`,
    details: { operation: 'add', before, after },
    tags: ['production', 'run', 'edit'],
  });

  return updated;
}

export async function updateRunStepOverride(params: {
  stepId: string;
  label?: string;
  required?: boolean;
  userId?: string;
}) {
  const { stepId, label, required, userId } = params;
  if (!stepId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'stepId is required');

  const step = await prisma.productionRunStep.findUnique({
    where: { id: stepId },
    select: { id: true, productionRunId: true },
  });
  if (!step) throw new AppError(ErrorCodes.NOT_FOUND, 'Step not found');

  const beforeRun = await assertRunEditableForStepOverrides(step.productionRunId);
  const before = snapshotSteps(beforeRun.steps);

  const data: { label?: string; required?: boolean } = {};
  if (label !== undefined) {
    const clean = label.trim();
    if (!clean) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'label cannot be empty');
    data.label = clean;
  }
  if (required !== undefined) data.required = !!required;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.productionRunStep.update({ where: { id: stepId }, data });
    const run = await tx.productionRun.findUnique({
      where: { id: step.productionRunId },
      include: {
        steps: { orderBy: { order: 'asc' }, select: { id: true, templateKey: true, label: true, order: true, required: true, status: true } },
      },
    });
    if (!run) throw new AppError(ErrorCodes.NOT_FOUND, 'Production run not found');
    return run;
  });

  const after = snapshotSteps(updated.steps);

  await logAction({
    entityType: ActivityEntity.PRODUCTION_RUN,
    entityId: step.productionRunId,
    action: 'production_run_steps_modified',
    userId,
    summary: `Updated production run step`,
    details: { operation: 'update', before, after, stepId },
    tags: ['production', 'run', 'edit'],
  });

  return updated;
}

export async function deleteRunStep(params: { stepId: string; userId?: string }) {
  const { stepId, userId } = params;
  if (!stepId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'stepId is required');

  const step = await prisma.productionRunStep.findUnique({
    where: { id: stepId },
    select: { id: true, productionRunId: true, status: true, label: true },
  });
  if (!step) throw new AppError(ErrorCodes.NOT_FOUND, 'Step not found');

  if (step.status !== ProductionStepStatus.PENDING) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Cannot remove a step that has started');
  }

  const beforeRun = await assertRunEditableForStepOverrides(step.productionRunId);
  const before = snapshotSteps(beforeRun.steps);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.productionRunStep.delete({ where: { id: stepId } });

    const remaining = await tx.productionRunStep.findMany({
      where: { productionRunId: step.productionRunId },
      orderBy: { order: 'asc' },
      select: { id: true, order: true },
    });
    for (let i = 0; i < remaining.length; i++) {
      const desired = i + 1;
      if (remaining[i].order !== desired) {
        await tx.productionRunStep.update({ where: { id: remaining[i].id }, data: { order: desired } });
      }
    }

    const run = await tx.productionRun.findUnique({
      where: { id: step.productionRunId },
      include: {
        steps: { orderBy: { order: 'asc' }, select: { id: true, templateKey: true, label: true, order: true, required: true, status: true } },
      },
    });
    if (!run) throw new AppError(ErrorCodes.NOT_FOUND, 'Production run not found');
    return run;
  });

  const after = snapshotSteps(updated.steps);

  await logAction({
    entityType: ActivityEntity.PRODUCTION_RUN,
    entityId: step.productionRunId,
    action: 'production_run_steps_modified',
    userId,
    summary: `Removed step "${step.label}" from production run`,
    details: { operation: 'delete', before, after, stepId },
    tags: ['production', 'run', 'edit'],
  });

  return updated;
}

export async function reorderRunSteps(params: { runId: string; orderedStepIds: string[]; userId?: string }) {
  const { runId, orderedStepIds, userId } = params;
  if (!runId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'runId is required');
  if (!Array.isArray(orderedStepIds) || orderedStepIds.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'orderedStepIds is required');
  }
  if (new Set(orderedStepIds).size !== orderedStepIds.length) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'orderedStepIds contains duplicates');
  }

  const beforeRun = await assertRunEditableForStepOverrides(runId);
  const before = snapshotSteps(beforeRun.steps);

  const allBelong = orderedStepIds.every((id) => beforeRun.steps.some((s) => s.id === id));
  if (!allBelong || orderedStepIds.length !== beforeRun.steps.length) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'orderedStepIds must include all run steps');
  }

  const updated = await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orderedStepIds.length; i++) {
      await tx.productionRunStep.update({
        where: { id: orderedStepIds[i] },
        data: { order: i + 1 },
      });
    }

    const run = await tx.productionRun.findUnique({
      where: { id: runId },
      include: {
        steps: { orderBy: { order: 'asc' }, select: { id: true, templateKey: true, label: true, order: true, required: true, status: true } },
      },
    });
    if (!run) throw new AppError(ErrorCodes.NOT_FOUND, 'Production run not found');
    return run;
  });

  const after = snapshotSteps(updated.steps);

  await logAction({
    entityType: ActivityEntity.PRODUCTION_RUN,
    entityId: runId,
    action: 'production_run_steps_modified',
    userId,
    summary: `Reordered production run steps`,
    details: { operation: 'reorder', before, after },
    tags: ['production', 'run', 'edit'],
  });

  return updated;
}

export async function claimRunStep(stepId: string, userId: string, userRole?: string) {
  if (!stepId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'stepId is required');
  if (!userId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'userId is required');

  const step = await prisma.productionRunStep.findUnique({
    where: { id: stepId },
    select: {
      id: true,
      productionRunId: true,
      label: true,
      assignedToUserId: true,
    },
  });
  if (!step) throw new AppError(ErrorCodes.NOT_FOUND, 'Step not found');

  if (step.assignedToUserId && step.assignedToUserId !== userId && userRole !== 'ADMIN') {
    throw new AppError(ErrorCodes.FORBIDDEN, 'This step is already assigned to another user.');
  }

  const updated = await prisma.productionRunStep.update({
    where: { id: stepId },
    data: { assignedToUserId: userId },
    select: { id: true, productionRunId: true, assignedToUserId: true },
  });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_RUN,
    entityId: updated.productionRunId,
    action: 'production_step_assigned',
    userId,
    summary: `Step claimed: ${step.label}`,
    details: { stepId, assignedToUserId: userId },
    tags: ['production', 'step', 'assign'],
  });

  return updated;
}

export async function adminAssignRunStep(params: {
  stepId: string;
  assignedToUserId: string | null;
  actorUserId: string;
  actorRole?: string;
}) {
  const { stepId, assignedToUserId, actorUserId, actorRole } = params;
  if (!stepId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'stepId is required');
  if (!actorUserId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'actorUserId is required');
  if (actorRole !== 'ADMIN') throw new AppError(ErrorCodes.FORBIDDEN, 'Admin only');

  const before = await prisma.productionRunStep.findUnique({
    where: { id: stepId },
    select: { id: true, productionRunId: true, label: true, assignedToUserId: true },
  });
  if (!before) throw new AppError(ErrorCodes.NOT_FOUND, 'Step not found');

  const updated = await prisma.productionRunStep.update({
    where: { id: stepId },
    data: { assignedToUserId },
    select: { id: true, productionRunId: true, assignedToUserId: true },
  });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_RUN,
    entityId: updated.productionRunId,
    action: 'production_step_reassigned',
    userId: actorUserId,
    summary: `Step reassigned: ${before.label}`,
    before: { assignedToUserId: before.assignedToUserId },
    after: { assignedToUserId },
    details: { stepId, assignedToUserId },
    tags: ['production', 'step', 'assign'],
  });

  return updated;
}

export async function getMyAssignedSteps(userId: string) {
  if (!userId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'userId is required');

  const steps = await prisma.productionRunStep.findMany({
    where: {
      assignedToUserId: userId,
      status: { in: [ProductionStepStatus.PENDING, ProductionStepStatus.IN_PROGRESS] },
      productionRun: { status: { in: [ProductionRunStatus.PLANNED, ProductionRunStatus.IN_PROGRESS] } },
    },
    include: {
      productionRun: {
        select: {
          id: true,
          status: true,
          quantity: true,
          product: { select: { id: true, name: true, sku: true } },
        },
      },
    },
    orderBy: [{ status: 'desc' }, { order: 'asc' }],
  });

  return steps.map((s) => ({
    stepId: s.id,
    stepLabel: s.label,
    stepKey: s.templateKey,
    stepStatus: s.status,
    order: s.order,
    required: s.required,
    run: {
      id: s.productionRun.id,
      status: s.productionRun.status,
      quantity: s.productionRun.quantity,
      product: s.productionRun.product,
    },
    startedAt: s.startedAt,
  }));
}

export async function getMyActiveProductionRuns(userId: string) {
  if (!userId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'userId is required');

  const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7d

  const runs = await prisma.productionRun.findMany({
    where: {
      status: { in: [ProductionRunStatus.PLANNED, ProductionRunStatus.IN_PROGRESS] },
      steps: {
        some: {
          performedById: userId,
          OR: [
            { status: ProductionStepStatus.IN_PROGRESS },
            { startedAt: { gte: recentCutoff } },
            { completedAt: { gte: recentCutoff } },
            { skippedAt: { gte: recentCutoff } },
          ],
        },
      },
    },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      steps: { orderBy: { order: 'asc' } },
    },
  });

  return runs.map((run) => {
    const inProgress = run.steps.find((s) => s.status === ProductionStepStatus.IN_PROGRESS);
    const nextPending = run.steps.find((s) => s.status === ProductionStepStatus.PENDING);
    const current = inProgress || nextPending || null;

    const mySteps = run.steps.filter((s) => s.performedById === userId);
    const lastActionTime = mySteps.reduce<Date | null>((acc, s) => {
      const t = s.skippedAt || s.completedAt || s.startedAt;
      if (!t) return acc;
      if (!acc) return t;
      return t > acc ? t : acc;
    }, null);

    return {
      runId: run.id,
      productId: run.productId,
      productName: run.product.name,
      productSku: run.product.sku,
      quantity: run.quantity,
      runStatus: run.status,
      currentStep: current
        ? {
            stepId: current.id,
            stepKey: current.templateKey,
            stepLabel: current.label,
            stepStatus: current.status,
            order: current.order,
          }
        : null,
      lastActionAt: lastActionTime || run.createdAt,
    };
  });
}


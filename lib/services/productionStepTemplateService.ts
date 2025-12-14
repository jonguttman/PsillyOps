// PRODUCTION STEP TEMPLATE SERVICE (Phase 5.3)
// Product-level editable default steps for future production runs.

import { prisma } from '@/lib/db/prisma';
import { logAction } from '@/lib/services/loggingService';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { ActivityEntity } from '@prisma/client';

function validateGapFreeOrders(orders: number[], productId: string) {
  const allInt = orders.every((o) => Number.isFinite(o) && Number.isInteger(o));
  const unique = new Set(orders).size === orders.length;
  const sorted = [...orders].sort((a, b) => a - b);
  let gapFree = true;
  if (sorted.length > 0) {
    const base = sorted[0];
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== base + i) {
        gapFree = false;
        break;
      }
    }
  }
  if (!allInt || !unique || !gapFree) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `Invalid ProductionStepTemplate ordering for product ${productId}. Duplicate or missing order values.`
    );
  }
}

export async function listProductStepTemplates(productId: string) {
  if (!productId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'productId is required');
  return prisma.productionStepTemplate.findMany({
    where: { productId },
    orderBy: { order: 'asc' },
  });
}

export async function createProductStepTemplate(params: {
  productId: string;
  key: string;
  label: string;
  required?: boolean;
  userId?: string;
}) {
  const { productId, key, label, required = true, userId } = params;
  const cleanKey = (key || '').trim();
  const cleanLabel = (label || '').trim();
  if (!productId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'productId is required');
  if (!cleanKey) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'key is required');
  if (!/^[a-z0-9_]+$/i.test(cleanKey)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'key must be letters/numbers/underscore only');
  }
  if (!cleanLabel) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'label is required');

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true } });
  if (!product) throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');

  const existing = await prisma.productionStepTemplate.findMany({
    where: { productId },
    orderBy: { order: 'asc' },
    select: { order: true },
  });
  const orders = existing.map((s) => s.order);
  if (orders.length > 0) validateGapFreeOrders(orders, productId);
  const nextOrder = orders.length > 0 ? Math.max(...orders) + 1 : 1;

  const created = await prisma.productionStepTemplate.create({
    data: {
      productId,
      key: cleanKey,
      label: cleanLabel,
      order: nextOrder,
      required: !!required,
    },
  });

  await logAction({
    entityType: ActivityEntity.PRODUCT,
    entityId: productId,
    action: 'production_step_template_created',
    userId,
    summary: `Created production step template "${created.label}" for "${product.name}"`,
    details: {
      stepId: created.id,
      stepKey: created.key,
      stepLabel: created.label,
      order: created.order,
      required: created.required,
    },
    tags: ['production', 'template', 'create'],
  });

  return created;
}

export async function updateProductStepTemplate(params: {
  productId: string;
  stepId: string;
  label?: string;
  required?: boolean;
  userId?: string;
}) {
  const { productId, stepId, label, required, userId } = params;
  if (!productId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'productId is required');
  if (!stepId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'stepId is required');

  const existing = await prisma.productionStepTemplate.findUnique({ where: { id: stepId } });
  if (!existing || existing.productId !== productId) throw new AppError(ErrorCodes.NOT_FOUND, 'Step template not found');

  const data: { label?: string; required?: boolean } = {};
  if (label !== undefined) {
    const cleanLabel = label.trim();
    if (!cleanLabel) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'label cannot be empty');
    data.label = cleanLabel;
  }
  if (required !== undefined) data.required = !!required;

  const updated = await prisma.productionStepTemplate.update({
    where: { id: stepId },
    data,
  });

  await logAction({
    entityType: ActivityEntity.PRODUCT,
    entityId: productId,
    action: 'production_step_template_updated',
    userId,
    summary: `Updated production step template "${updated.label}"`,
    before: { label: existing.label, required: existing.required },
    after: { label: updated.label, required: updated.required },
    details: { stepId: updated.id, stepKey: updated.key, order: updated.order },
    tags: ['production', 'template', 'update'],
  });

  return updated;
}

export async function reorderProductStepTemplates(params: {
  productId: string;
  orderedStepIds: string[];
  userId?: string;
}) {
  const { productId, orderedStepIds, userId } = params;
  if (!productId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'productId is required');
  if (!Array.isArray(orderedStepIds) || orderedStepIds.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'orderedStepIds is required');
  }
  if (new Set(orderedStepIds).size !== orderedStepIds.length) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'orderedStepIds contains duplicates');
  }

  const templates = await prisma.productionStepTemplate.findMany({
    where: { productId },
    orderBy: { order: 'asc' },
  });

  if (templates.length !== orderedStepIds.length) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'orderedStepIds must include all step templates for this product');
  }

  const allBelong = orderedStepIds.every((id) => templates.some((t) => t.id === id));
  if (!allBelong) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'orderedStepIds contains invalid stepId for this product');

  const before = templates.map((t) => ({ id: t.id, key: t.key, label: t.label, order: t.order }));

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orderedStepIds.length; i++) {
      await tx.productionStepTemplate.update({
        where: { id: orderedStepIds[i] },
        data: { order: i + 1 },
      });
    }
  });

  await logAction({
    entityType: ActivityEntity.PRODUCT,
    entityId: productId,
    action: 'production_step_template_reordered',
    userId,
    summary: `Reordered production step templates`,
    details: {
      before,
      after: orderedStepIds.map((id, idx) => ({ id, order: idx + 1 })),
    },
    tags: ['production', 'template', 'reorder'],
  });

  return listProductStepTemplates(productId);
}

export async function deleteProductStepTemplate(params: {
  productId: string;
  stepId: string;
  userId?: string;
}) {
  const { productId, stepId, userId } = params;
  if (!productId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'productId is required');
  if (!stepId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'stepId is required');

  const step = await prisma.productionStepTemplate.findUnique({ where: { id: stepId } });
  if (!step || step.productId !== productId) throw new AppError(ErrorCodes.NOT_FOUND, 'Step template not found');

  // Only allow delete if unused by ACTIVE runs (PLANNED / IN_PROGRESS) for this product.
  const activeUse = await prisma.productionRunStep.findFirst({
    where: {
      templateKey: step.key,
      productionRun: {
        productId,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
    },
    select: { id: true, productionRunId: true },
  });
  if (activeUse) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Cannot delete this step template because it is used by an active production run.'
    );
  }

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true } });

  await prisma.$transaction(async (tx) => {
    await tx.productionStepTemplate.delete({ where: { id: stepId } });

    // Re-sequence remaining orders to stay gap-free.
    const remaining = await tx.productionStepTemplate.findMany({
      where: { productId },
      orderBy: { order: 'asc' },
    });

    for (let i = 0; i < remaining.length; i++) {
      const desired = i + 1;
      if (remaining[i].order !== desired) {
        await tx.productionStepTemplate.update({ where: { id: remaining[i].id }, data: { order: desired } });
      }
    }
  });

  await logAction({
    entityType: ActivityEntity.PRODUCT,
    entityId: productId,
    action: 'production_step_template_deleted',
    userId,
    summary: `Deleted production step template "${step.label}" from "${product?.name || 'product'}"`,
    details: { stepId: step.id, stepKey: step.key, stepLabel: step.label, order: step.order },
    tags: ['production', 'template', 'delete'],
  });

  return { success: true };
}


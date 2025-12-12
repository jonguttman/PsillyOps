// PRODUCTION TEMPLATE SERVICE - Production template management
// Business logic for production templates

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { ActivityEntity } from '@prisma/client';

/**
 * List all production templates
 */
export async function listProductionTemplates(params: {
  productId?: string;
  includeInactive?: boolean;
} = {}) {
  const where: any = {};

  if (params.productId) {
    where.productId = params.productId;
  }

  if (!params.includeInactive) {
    where.active = true;
  }

  const templates = await prisma.productionTemplate.findMany({
    where,
    include: {
      product: {
        select: { id: true, name: true, sku: true }
      },
      _count: {
        select: { productionOrders: true }
      }
    },
    orderBy: [
      { product: { name: 'asc' } },
      { name: 'asc' }
    ]
  });

  return templates;
}

/**
 * Get production template by ID
 */
export async function getProductionTemplate(id: string) {
  const template = await prisma.productionTemplate.findUnique({
    where: { id },
    include: {
      product: {
        include: {
          bom: {
            where: { active: true },
            include: { material: true }
          }
        }
      },
      productionOrders: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true } }
        }
      },
      _count: {
        select: { productionOrders: true }
      }
    }
  });

  if (!template) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Production template not found');
  }

  return template;
}

/**
 * Create a new production template
 */
export async function createProductionTemplate(params: {
  name: string;
  productId: string;
  defaultBatchSize: number;
  instructions?: string;
  userId: string;
}): Promise<string> {
  const { name, productId, defaultBatchSize, instructions, userId } = params;

  // Verify product exists
  const product = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!product) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
  }

  // Check for duplicate template name for this product
  const existing = await prisma.productionTemplate.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      productId
    }
  });

  if (existing) {
    throw new AppError(
      ErrorCodes.DUPLICATE,
      'A template with this name already exists for this product'
    );
  }

  const template = await prisma.productionTemplate.create({
    data: {
      name,
      productId,
      defaultBatchSize,
      instructions,
      active: true
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.PRODUCT,
    entityId: productId,
    action: 'template_created',
    userId,
    summary: `${user?.name || 'User'} created production template "${name}" for ${product.name}`,
    details: {
      templateId: template.id,
      name,
      productName: product.name,
      defaultBatchSize,
      instructions
    },
    tags: ['created', 'template']
  });

  return template.id;
}

/**
 * Update a production template
 */
export async function updateProductionTemplate(
  id: string,
  updates: {
    name?: string;
    defaultBatchSize?: number;
    instructions?: string;
    active?: boolean;
  },
  userId: string
): Promise<void> {
  const template = await prisma.productionTemplate.findUnique({
    where: { id },
    include: { product: true }
  });

  if (!template) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Production template not found');
  }

  // Check for duplicate name if updating name
  if (updates.name && updates.name !== template.name) {
    const existing = await prisma.productionTemplate.findFirst({
      where: {
        name: { equals: updates.name, mode: 'insensitive' },
        productId: template.productId,
        id: { not: id }
      }
    });

    if (existing) {
      throw new AppError(
        ErrorCodes.DUPLICATE,
        'A template with this name already exists for this product'
      );
    }
  }

  const before = {
    name: template.name,
    defaultBatchSize: template.defaultBatchSize,
    instructions: template.instructions,
    active: template.active
  };

  await prisma.productionTemplate.update({
    where: { id },
    data: updates
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.PRODUCT,
    entityId: template.productId,
    action: 'template_updated',
    userId,
    summary: `${user?.name || 'User'} updated production template "${template.name}"`,
    before,
    after: updates,
    details: {
      templateId: id,
      productName: template.product.name
    },
    tags: ['updated', 'template']
  });
}

/**
 * Archive a production template (soft delete)
 */
export async function archiveProductionTemplate(id: string, userId: string): Promise<void> {
  const template = await prisma.productionTemplate.findUnique({
    where: { id },
    include: { product: true }
  });

  if (!template) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Production template not found');
  }

  await prisma.productionTemplate.update({
    where: { id },
    data: { active: false }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.PRODUCT,
    entityId: template.productId,
    action: 'template_archived',
    userId,
    summary: `${user?.name || 'User'} archived production template "${template.name}"`,
    before: { active: true },
    after: { active: false },
    details: {
      templateId: id,
      templateName: template.name,
      productName: template.product.name
    },
    tags: ['archived', 'template']
  });
}

/**
 * Get templates for a specific product
 */
export async function getTemplatesForProduct(productId: string) {
  return prisma.productionTemplate.findMany({
    where: {
      productId,
      active: true
    },
    orderBy: { name: 'asc' }
  });
}

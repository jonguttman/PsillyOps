// PRODUCTION SERVICE - Batch lifecycle and production management
// ALL business logic for production orders and batches

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction, generateSummary } from './loggingService';
import { ActivityEntity, BatchStatus, ProductionStatus, QCStatus, InventoryStatus } from '@prisma/client';
import { generateBatchCode, generateOrderNumber } from '@/lib/utils/formatters';
import { consumeMaterial, produceFinishedGoods } from './inventoryService';

// ========================================
// PRODUCTION ORDER MANAGEMENT
// ========================================

export interface ProductionOrderFilter {
  status?: ProductionStatus;
  productId?: string;
  workCenterId?: string;
  scheduledDateFrom?: Date;
  scheduledDateTo?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get paginated production order list
 */
export async function getProductionOrderList(filter: ProductionOrderFilter = {}) {
  const where: any = {};

  if (filter.status) where.status = filter.status;
  if (filter.productId) where.productId = filter.productId;
  if (filter.workCenterId) where.workCenterId = filter.workCenterId;

  if (filter.search) {
    where.OR = [
      { orderNumber: { contains: filter.search } },
      { product: { name: { contains: filter.search } } }
    ];
  }

  if (filter.scheduledDateFrom || filter.scheduledDateTo) {
    where.scheduledDate = {};
    if (filter.scheduledDateFrom) where.scheduledDate.gte = filter.scheduledDateFrom;
    if (filter.scheduledDateTo) where.scheduledDate.lte = filter.scheduledDateTo;
  }

  const [orders, total] = await Promise.all([
    prisma.productionOrder.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        workCenter: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        batches: {
          select: {
            id: true,
            batchCode: true,
            status: true,
            actualQuantity: true,
            qcStatus: true
          }
        },
        materials: {
          select: {
            id: true,
            requiredQty: true,
            issuedQty: true,
            shortage: true,
            material: { select: { id: true, name: true } }
          }
        },
        _count: {
          select: { batches: true }
        }
      },
      orderBy: [
        { scheduledDate: 'asc' },
        { createdAt: 'desc' }
      ],
      take: filter.limit || 50,
      skip: filter.offset || 0
    }),
    prisma.productionOrder.count({ where })
  ]);

  return { orders, total };
}

/**
 * Get production order detail with materials and batches
 */
export async function getProductionOrderDetail(orderId: string) {
  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: {
      product: {
        include: {
          bom: {
            where: { active: true },
            include: { material: true }
          }
        }
      },
      workCenter: true,
      template: true,
      createdBy: { select: { id: true, name: true, email: true } },
      batches: {
        include: {
          makers: {
            include: { user: { select: { id: true, name: true } } }
          },
          laborEntries: {
            include: { user: { select: { id: true, name: true } } }
          }
        },
        orderBy: { createdAt: 'asc' }
      },
      materials: {
        include: {
          material: true
        },
        orderBy: { material: { name: 'asc' } }
      }
    }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Production order not found');
  }

  return order;
}

/**
 * Create a production order with material requirements from BOM
 */
export async function createProductionOrder(params: {
  productId: string;
  quantityToMake: number;
  batchSize?: number;
  scheduledDate?: Date;
  dueDate?: Date;
  workCenterId?: string;
  templateId?: string;
  linkedRetailerOrderIds?: string[];
  userId: string;
}): Promise<string> {
  const {
    productId,
    quantityToMake,
    batchSize,
    scheduledDate,
    dueDate,
    workCenterId,
    templateId,
    linkedRetailerOrderIds,
    userId
  } = params;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      bom: {
        where: { active: true },
        include: { material: true }
      }
    }
  });

  if (!product) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
  }

  // Validate userId exists
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
  }

  // Validate workCenterId if provided
  if (workCenterId) {
    const workCenter = await prisma.workCenter.findUnique({
      where: { id: workCenterId }
    });

    if (!workCenter) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Work center not found');
    }
  }

  // If template provided, validate it and get default batch size
  let effectiveBatchSize = batchSize;
  if (templateId) {
    const template = await prisma.productionTemplate.findUnique({
      where: { id: templateId }
    });
    
    if (!template) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Production template not found');
    }
    
    if (!batchSize) {
      effectiveBatchSize = template.defaultBatchSize;
    }
  }

  // Fall back to product default batch size
  if (!effectiveBatchSize) {
    effectiveBatchSize = product.defaultBatchSize || quantityToMake;
  }

  // Generate order number
  const orderNumber = generateOrderNumber('PO');

  // Calculate material requirements based on BOM
  const materialRequirements: Array<{
    materialId: string;
    materialName: string;
    requiredQty: number;
    availableQty: number;
    shortage: number;
  }> = [];

  for (const bomItem of product.bom) {
    const requiredQty = bomItem.quantityPerUnit * quantityToMake;
    
    // Get available inventory for this material
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: {
        materialId: bomItem.materialId,
        type: 'MATERIAL',
        status: 'AVAILABLE'
      }
    });

    const availableQty = inventoryItems.reduce(
      (sum, item) => sum + (item.quantityOnHand - item.quantityReserved),
      0
    );

    const shortage = Math.max(0, requiredQty - availableQty);

    materialRequirements.push({
      materialId: bomItem.materialId,
      materialName: bomItem.material.name,
      requiredQty,
      availableQty,
      shortage
    });
  }

  // Create production order
  const productionOrder = await prisma.productionOrder.create({
    data: {
      orderNumber,
      productId,
      quantityToMake,
      batchSize: effectiveBatchSize,
      status: ProductionStatus.PLANNED,
      scheduledDate,
      dueDate,
      workCenterId,
      templateId,
      createdByUserId: userId,
      linkedRetailerOrderIds: linkedRetailerOrderIds || [],
      materialRequirements: materialRequirements
    }
  });

  // Create ProductionOrderMaterial records
  if (materialRequirements.length > 0) {
    await prisma.productionOrderMaterial.createMany({
      data: materialRequirements.map(req => ({
        productionOrderId: productionOrder.id,
        materialId: req.materialId,
        requiredQty: req.requiredQty,
        shortage: req.shortage
      }))
    });
  }

  await logAction({
    entityType: ActivityEntity.PRODUCTION_ORDER,
    entityId: productionOrder.id,
    action: 'created',
    userId,
    summary: generateSummary({
      userName: user?.name || 'User',
      action: 'created',
      entityName: `production order ${orderNumber}`,
      metadata: {
        product: product.name,
        quantity: quantityToMake
      }
    }),
    metadata: {
      orderNumber,
      productId,
      productName: product.name,
      quantityToMake,
      batchSize: effectiveBatchSize,
      scheduledDate,
      workCenterId,
      templateId,
      materialRequirements
    },
    tags: ['created']
  });

  return productionOrder.id;
}

/**
 * Manufacturing step type for Product.manufacturingSteps JSON
 */
interface ManufacturingStep {
  key: string;
  label: string;
  order: number;
  required: boolean;
  dependsOnKeys?: string[];
  estimatedMinutes?: number;
}

/**
 * Start a production order - creates ProductionRun and Batches
 */
export async function startProductionOrder(
  orderId: string,
  userId: string,
  assignToUserId?: string // Optional: assign to specific user (defaults to order's assignee)
): Promise<{ productionRunId: string; batchIds: string[] }> {
  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: { 
      product: {
        include: {
          bom: {
            where: { active: true },
            include: { material: true }
          }
        }
      }
    }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Production order not found');
  }

  if (order.status !== ProductionStatus.PLANNED) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      `Cannot start order in ${order.status} status`
    );
  }

  const product = order.product;
  const batchSize = order.batchSize || product.defaultBatchSize || order.quantityToMake;
  const numBatches = Math.ceil(order.quantityToMake / batchSize);
  
  // Determine assignee: explicit param > order's assignee > creator
  const effectiveAssigneeId = assignToUserId || order.assignedToUserId || order.createdByUserId;

  const before = { status: order.status, startedAt: order.startedAt };
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const assignee = effectiveAssigneeId ? await prisma.user.findUnique({ where: { id: effectiveAssigneeId } }) : null;

  // Parse manufacturing steps from product (or use defaults)
  const manufacturingSteps: ManufacturingStep[] = (product.manufacturingSteps as ManufacturingStep[]) || [
    { key: 'prep', label: 'Preparation', order: 1, required: true },
    { key: 'production', label: 'Production', order: 2, required: true },
    { key: 'qc', label: 'Quality Check', order: 3, required: true },
    { key: 'packaging', label: 'Packaging', order: 4, required: true }
  ];

  // Parse required equipment from product
  const requiredEquipment: string[] = (product.requiredEquipment as string[]) || [];

  // Create everything in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create ProductionRun
    const productionRun = await tx.productionRun.create({
      data: {
        productId: product.id,
        productionOrderId: orderId,
        quantity: order.quantityToMake,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        createdById: userId,
        assignedToUserId: effectiveAssigneeId,
        assignedByUserId: userId,
        assignedAt: new Date(),
      }
    });

    // 2. Create ProductionRunSteps
    let stepOrder = 0;

    // 2a. Equipment check steps (if any)
    for (const equipment of requiredEquipment) {
      stepOrder++;
      await tx.productionRunStep.create({
        data: {
          productionRunId: productionRun.id,
          templateKey: `equipment_${equipment.toLowerCase().replace(/\s+/g, '_')}`,
          label: `Gather: ${equipment}`,
          order: stepOrder,
          required: true,
          stepType: 'EQUIPMENT_CHECK',
          dependsOnKeys: [],
        }
      });
    }

    // 2b. Material issuance steps (from BOM)
    const materialStepKeys: string[] = [];
    for (const bomItem of product.bom) {
      stepOrder++;
      const stepKey = `material_${bomItem.materialId}`;
      materialStepKeys.push(stepKey);
      const totalQty = bomItem.quantityPerUnit * order.quantityToMake;
      
      await tx.productionRunStep.create({
        data: {
          productionRunId: productionRun.id,
          templateKey: stepKey,
          label: `Issue: ${bomItem.material.name} (${totalQty} ${bomItem.material.unitOfMeasure})`,
          order: stepOrder,
          required: true,
          stepType: 'MATERIAL_ISSUE',
          materialId: bomItem.materialId,
          materialQty: totalQty,
          dependsOnKeys: [], // Materials can be issued in parallel
        }
      });
    }

    // 2c. Manufacturing instruction steps
    for (const step of manufacturingSteps) {
      stepOrder++;
      // First manufacturing step depends on all materials being issued
      const dependsOn = step.order === 1 ? materialStepKeys : (step.dependsOnKeys || []);
      
      await tx.productionRunStep.create({
        data: {
          productionRunId: productionRun.id,
          templateKey: step.key,
          label: step.label,
          order: stepOrder,
          required: step.required,
          stepType: 'INSTRUCTION',
          dependsOnKeys: dependsOn,
          estimatedMinutes: step.estimatedMinutes,
        }
      });
    }

    // 3. Create Batches
    const batchIds: string[] = [];
    let remainingQty = order.quantityToMake;
    
    for (let i = 0; i < numBatches; i++) {
      const batchQty = Math.min(batchSize, remainingQty);
      remainingQty -= batchQty;
      
      const batchCode = generateBatchCode(product.sku);
      
      const batch = await tx.batch.create({
        data: {
          productId: product.id,
          productionOrderId: orderId,
          productionRunId: productionRun.id,
          batchCode,
          plannedQuantity: batchQty,
          status: 'PLANNED',
        }
      });
      
      batchIds.push(batch.id);
    }

    // 4. Update ProductionOrder status
    await tx.productionOrder.update({
      where: { id: orderId },
      data: {
        status: ProductionStatus.IN_PROGRESS,
        startedAt: new Date(),
        // Update assignment if changed
        ...(assignToUserId && assignToUserId !== order.assignedToUserId ? {
          assignedToUserId: assignToUserId,
          assignedByUserId: userId,
          assignedAt: new Date(),
        } : {})
      }
    });

    return { productionRunId: productionRun.id, batchIds };
  });

  // Log the action
  await logAction({
    entityType: ActivityEntity.PRODUCTION_ORDER,
    entityId: orderId,
    action: 'started',
    userId,
    summary: generateSummary({
      userName: user?.name || 'User',
      action: 'started',
      entityName: `production order ${order.orderNumber}`,
      metadata: {
        assignedTo: assignee?.name,
        batches: result.batchIds.length
      }
    }),
    before,
    after: {
      status: ProductionStatus.IN_PROGRESS,
      startedAt: new Date(),
      productionRunId: result.productionRunId,
      batchCount: result.batchIds.length
    },
    metadata: {
      orderNumber: order.orderNumber,
      productName: product.name,
      productionRunId: result.productionRunId,
      batchIds: result.batchIds,
      assignedToUserId: effectiveAssigneeId,
      assignedToName: assignee?.name
    },
    tags: ['status_change', 'production_run_created']
  });

  return result;
}

/**
 * Block a production order (e.g., due to QC issues or material shortage)
 */
export async function blockProductionOrder(
  orderId: string,
  reason: string,
  userId: string
): Promise<void> {
  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: { product: true }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Production order not found');
  }

  if (order.status === ProductionStatus.COMPLETED || order.status === ProductionStatus.CANCELLED) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      `Cannot block order in ${order.status} status`
    );
  }

  const before = { status: order.status };

  await prisma.productionOrder.update({
    where: { id: orderId },
    data: {
      status: ProductionStatus.BLOCKED
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_ORDER,
    entityId: orderId,
    action: 'blocked',
    userId,
    summary: `${user?.name || 'User'} blocked production order ${order.orderNumber}: ${reason}`,
    before,
    after: { status: ProductionStatus.BLOCKED },
    metadata: {
      orderNumber: order.orderNumber,
      productName: order.product.name,
      reason
    },
    tags: ['status_change', 'blocked']
  });
}

/**
 * Complete a production order
 */
export async function completeProductionOrder(
  orderId: string,
  userId: string
): Promise<void> {
  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: {
      product: true,
      batches: true
    }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Production order not found');
  }

  // Check if all batches are released or cancelled
  const activeBatches = order.batches.filter(
    b => b.status !== BatchStatus.CANCELLED
  );

  const releasedBatches = activeBatches.filter(
    b => b.status === BatchStatus.RELEASED || b.status === BatchStatus.EXHAUSTED
  );

  if (releasedBatches.length !== activeBatches.length) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Cannot complete order - not all batches are released'
    );
  }

  const totalProduced = releasedBatches.reduce(
    (sum, b) => sum + (b.actualQuantity || 0),
    0
  );

  const before = { status: order.status, completedAt: order.completedAt };

  await prisma.productionOrder.update({
    where: { id: orderId },
    data: {
      status: ProductionStatus.COMPLETED,
      completedAt: new Date()
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_ORDER,
    entityId: orderId,
    action: 'completed',
    userId,
    summary: generateSummary({
      userName: user?.name || 'User',
      action: 'completed',
      entityName: `production order ${order.orderNumber}`,
      metadata: {
        quantity: totalProduced
      }
    }),
    before,
    after: {
      status: ProductionStatus.COMPLETED,
      completedAt: new Date()
    },
    metadata: {
      orderNumber: order.orderNumber,
      productName: order.product.name,
      quantityToMake: order.quantityToMake,
      totalProduced,
      batchesCompleted: releasedBatches.length
    },
    tags: ['status_change', 'completed']
  });
}

/**
 * Archive a blocked production order (permanent action)
 * This removes the order from the active blocked alerts but preserves the record
 */
export async function archiveBlockedOrder(
  orderId: string,
  reason: string,
  userId: string
): Promise<void> {
  if (!reason || reason.trim().length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Archive reason is required');
  }

  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: { product: true }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Production order not found');
  }

  if (order.status !== ProductionStatus.BLOCKED) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Only blocked orders can be archived'
    );
  }

  if (order.archivedAt) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Order is already archived'
    );
  }

  const before = { 
    status: order.status,
    archivedAt: null,
    archiveReason: null
  };

  await prisma.productionOrder.update({
    where: { id: orderId },
    data: {
      archivedAt: new Date(),
      archiveReason: reason.trim()
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_ORDER,
    entityId: orderId,
    action: 'archived',
    userId,
    summary: `${user?.name || 'User'} archived blocked production order ${order.orderNumber}: ${reason.trim()}`,
    before,
    after: {
      status: order.status,
      archivedAt: new Date(),
      archiveReason: reason.trim()
    },
    metadata: {
      orderNumber: order.orderNumber,
      productName: order.product.name,
      reason: reason.trim()
    },
    tags: ['archived', 'blocked']
  });
}

/**
 * Unblock a production order and return it to PLANNED status
 * This allows the order to be rescheduled and worked on again
 */
export async function unblockProductionOrder(
  orderId: string,
  userId: string
): Promise<void> {
  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: { product: true }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Production order not found');
  }

  if (order.status !== ProductionStatus.BLOCKED) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Only blocked orders can be unblocked'
    );
  }

  if (order.archivedAt) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Archived orders cannot be unblocked'
    );
  }

  const before = { status: order.status };

  await prisma.productionOrder.update({
    where: { id: orderId },
    data: {
      status: ProductionStatus.PLANNED
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_ORDER,
    entityId: orderId,
    action: 'unblocked',
    userId,
    summary: `${user?.name || 'User'} unblocked production order ${order.orderNumber} and returned it to production queue`,
    before,
    after: { status: ProductionStatus.PLANNED },
    metadata: {
      orderNumber: order.orderNumber,
      productName: order.product.name
    },
    tags: ['status_change', 'unblocked']
  });
}

/**
 * Dismiss a completed production order from the Kanban board
 * This hides the order from the active view but preserves the record
 */
export async function dismissCompletedOrder(
  orderId: string,
  userId: string
): Promise<void> {
  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: { product: true }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Production order not found');
  }

  if (order.status !== ProductionStatus.COMPLETED) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Only completed orders can be dismissed'
    );
  }

  if (order.dismissedAt) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Order is already dismissed'
    );
  }

  await prisma.productionOrder.update({
    where: { id: orderId },
    data: {
      dismissedAt: new Date()
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_ORDER,
    entityId: orderId,
    action: 'dismissed',
    userId,
    summary: `${user?.name || 'User'} dismissed completed production order ${order.orderNumber} from the board`,
    before: { dismissedAt: null },
    after: { dismissedAt: new Date() },
    metadata: {
      orderNumber: order.orderNumber,
      productName: order.product.name
    },
    tags: ['dismissed', 'completed']
  });
}

/**
 * Calculate and update material requirements for a production order
 * @param orderId - The production order ID
 * @param userId - Optional user ID (null for system-triggered recalculations)
 */
export async function calculateMaterialRequirements(orderId: string, userId?: string | null) {
  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: {
      product: {
        include: {
          bom: {
            where: { active: true },
            include: { material: true }
          }
        }
      }
    }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Production order not found');
  }

  const requirements: Array<{
    materialId: string;
    materialName: string;
    requiredQty: number;
    availableQty: number;
    shortage: number;
  }> = [];

  for (const bomItem of order.product.bom) {
    const requiredQty = bomItem.quantityPerUnit * order.quantityToMake;

    // Get available inventory
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: {
        materialId: bomItem.materialId,
        type: 'MATERIAL',
        status: 'AVAILABLE'
      }
    });

    const availableQty = inventoryItems.reduce(
      (sum, item) => sum + (item.quantityOnHand - item.quantityReserved),
      0
    );

    const shortage = Math.max(0, requiredQty - availableQty);

    requirements.push({
      materialId: bomItem.materialId,
      materialName: bomItem.material.name,
      requiredQty,
      availableQty,
      shortage
    });

    // Update or create ProductionOrderMaterial record
    await prisma.productionOrderMaterial.upsert({
      where: {
        productionOrderId_materialId: {
          productionOrderId: orderId,
          materialId: bomItem.materialId
        }
      },
      update: {
        requiredQty,
        shortage
      },
      create: {
        productionOrderId: orderId,
        materialId: bomItem.materialId,
        requiredQty,
        shortage
      }
    });
  }

  // Update JSON field for backward compatibility
  await prisma.productionOrder.update({
    where: { id: orderId },
    data: {
      materialRequirements: requirements
    }
  });

  // Log the recalculation - fires every time requirements are recalculated
  await logAction({
    entityType: ActivityEntity.PRODUCTION_ORDER,
    entityId: orderId,
    action: 'material_requirements_calculated',
    userId: userId || undefined,
    summary: `Recalculated material requirements for production order ${order.orderNumber || order.id}`,
    metadata: {
      orderNumber: order.orderNumber,
      productId: order.productId,
      quantityToMake: order.quantityToMake,
      batchSize: order.batchSize,
      requirements
    },
    tags: ['production', 'materials', 'system']
  });

  return requirements;
}

/**
 * Issue materials for a production order
 */
export async function issueMaterials(
  orderId: string,
  materialIssuances: Array<{
    materialId: string;
    quantity: number;
  }>,
  userId: string
): Promise<{ issued: Array<{ materialId: string; quantity: number }> }> {
  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: {
      materials: {
        include: { material: true }
      },
      batches: {
        where: { status: { not: BatchStatus.CANCELLED } },
        take: 1
      }
    }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Production order not found');
  }

  if (order.status === ProductionStatus.COMPLETED || order.status === ProductionStatus.CANCELLED) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Cannot issue materials to completed/cancelled order'
    );
  }

  const batchId = order.batches[0]?.id;
  const issuedMaterials: Array<{ materialId: string; quantity: number }> = [];

  for (const issuance of materialIssuances) {
    const orderMaterial = order.materials.find(m => m.materialId === issuance.materialId);
    
    if (!orderMaterial) {
      throw new AppError(
        ErrorCodes.NOT_FOUND,
        `Material ${issuance.materialId} not found in production order`
      );
    }

    // Consume the material from inventory (FIFO)
    const result = await consumeMaterial({
      materialId: issuance.materialId,
      quantity: issuance.quantity,
      productionOrderId: orderId,
      batchId,
      reason: `Issued to production order ${order.orderNumber}`,
      userId
    });

    // Update issued quantity
    await prisma.productionOrderMaterial.update({
      where: { id: orderMaterial.id },
      data: {
        issuedQty: {
          increment: result.consumed
        }
      }
    });

    issuedMaterials.push({
      materialId: issuance.materialId,
      quantity: result.consumed
    });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.PRODUCTION_ORDER,
    entityId: orderId,
    action: 'materials_issued',
    userId,
    summary: `${user?.name || 'User'} issued materials to ${order.orderNumber}`,
    metadata: {
      orderNumber: order.orderNumber,
      issuedMaterials
    },
    tags: ['material_issue']
  });

  return { issued: issuedMaterials };
}

// ========================================
// QC STATUS MANAGEMENT
// ========================================

/**
 * Set batch QC status
 */
export async function setBatchQCStatus(
  batchId: string,
  qcStatus: QCStatus,
  userId: string,
  notes?: string
): Promise<void> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      product: true,
      inventory: true
    }
  });

  if (!batch) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
  }

  const before = { qcStatus: batch.qcStatus, notes: batch.notes };

  // Update batch QC status
  await prisma.batch.update({
    where: { id: batchId },
    data: {
      qcStatus,
      notes: notes || batch.notes
    }
  });

  // Handle inventory based on QC status
  if (qcStatus === QCStatus.HOLD || qcStatus === QCStatus.FAILED) {
    // Quarantine inventory from this batch
    await prisma.inventoryItem.updateMany({
      where: { batchId },
      data: { status: InventoryStatus.QUARANTINED }
    });
  } else if (qcStatus === QCStatus.PASSED) {
    // Release quarantined inventory
    await prisma.inventoryItem.updateMany({
      where: {
        batchId,
        status: InventoryStatus.QUARANTINED
      },
      data: { status: InventoryStatus.AVAILABLE }
    });

    // Update batch status to RELEASED if it was in QC_HOLD
    if (batch.status === BatchStatus.QC_HOLD) {
      await prisma.batch.update({
        where: { id: batchId },
        data: { status: BatchStatus.RELEASED }
      });
    }
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.BATCH,
    entityId: batchId,
    action: 'qc_status_updated',
    userId,
    summary: `${user?.name || 'User'} set QC status to ${qcStatus} for batch ${batch.batchCode}`,
    before,
    after: { qcStatus, notes },
    metadata: {
      batchCode: batch.batchCode,
      productName: batch.product.name,
      previousQCStatus: batch.qcStatus,
      newQCStatus: qcStatus,
      notes,
      inventoryAffected: batch.inventory.length
    },
    tags: ['qc', 'status_change']
  });
}

// ========================================
// LABOR TRACKING
// ========================================

/**
 * Add a labor entry to a batch
 */
export async function addLaborEntry(params: {
  batchId: string;
  userId: string;
  minutes: number;
  role?: string;
  notes?: string;
  loggedByUserId: string;
}): Promise<string> {
  const { batchId, userId, minutes, role, notes, loggedByUserId } = params;

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { product: true }
  });

  if (!batch) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
  }

  const worker = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!worker) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Worker not found');
  }

  const laborEntry = await prisma.laborEntry.create({
    data: {
      batchId,
      userId,
      minutes,
      role,
      notes
    }
  });

  const loggedBy = await prisma.user.findUnique({ where: { id: loggedByUserId } });

  await logAction({
    entityType: ActivityEntity.BATCH,
    entityId: batchId,
    action: 'labor_logged',
    userId: loggedByUserId,
    summary: `${loggedBy?.name || 'User'} logged ${minutes} minutes of labor for ${worker.name} on batch ${batch.batchCode}`,
    metadata: {
      batchCode: batch.batchCode,
      productName: batch.product.name,
      workerName: worker.name,
      minutes,
      role,
      notes
    },
    tags: ['labor']
  });

  return laborEntry.id;
}

/**
 * Get labor entries for a batch
 */
export async function getLaborEntries(batchId: string) {
  const entries = await prisma.laborEntry.findMany({
    where: { batchId },
    include: {
      user: {
        select: { id: true, name: true, email: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

  return { entries, totalMinutes, totalHours };
}

/**
 * Get batch detail with all related data
 */
export async function getBatchDetail(batchId: string) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      product: true,
      productionOrder: {
        include: {
          workCenter: true
        }
      },
      makers: {
        include: {
          user: { select: { id: true, name: true, email: true } }
        }
      },
      laborEntries: {
        include: {
          user: { select: { id: true, name: true, email: true } }
        },
        orderBy: { createdAt: 'desc' }
      },
      inventory: {
        include: {
          location: true
        }
      }
    }
  });

  if (!batch) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
  }

  // Get inventory movements for this batch
  const movements = await prisma.inventoryMovement.findMany({
    where: { batchId },
    orderBy: { createdAt: 'desc' }
  });

  // Calculate labor totals
  const laborTotalMinutes = batch.laborEntries.reduce((sum, e) => sum + e.minutes, 0);

  return {
    batch,
    movements,
    laborTotalMinutes,
    laborTotalHours: Math.round((laborTotalMinutes / 60) * 100) / 100
  };
}

// ========================================
// EXISTING BATCH FUNCTIONS (ENHANCED)
// ========================================

/**
 * Create a batch from a production order
 */
export async function createBatch(params: {
  productId: string;
  plannedQuantity: number;
  productionOrderId?: string;
  expectedYield?: number;
  manufactureDate?: Date;
  expirationDate?: Date;
  notes?: string;
  userId: string;
}): Promise<string> {
  const { productId, plannedQuantity, productionOrderId, expectedYield, manufactureDate, expirationDate, notes, userId } = params;

  const product = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!product) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
  }

  // Generate batch code
  const batchCode = generateBatchCode(product.sku);

  const batch = await prisma.batch.create({
    data: {
      productId,
      batchCode,
      plannedQuantity,
      expectedYield: expectedYield ?? plannedQuantity,
      manufactureDate,
      expirationDate,
      status: BatchStatus.PLANNED,
      qcStatus: QCStatus.NOT_REQUIRED,
      productionOrderId,
      notes
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.BATCH,
    entityId: batch.id,
    action: 'created',
    userId,
    summary: generateSummary({
      userName: user?.name || 'System',
      action: 'created',
      entityName: `batch ${batchCode}`,
      metadata: {
        product: product.name,
        quantity: plannedQuantity
      }
    }),
    metadata: {
      productId,
      productName: product.name,
      plannedQuantity,
      expectedYield: expectedYield ?? plannedQuantity,
      productionOrderId
    },
    tags: ['created']
  });

  return batch.id;
}

/**
 * Update batch details
 */
export async function updateBatch(
  batchId: string,
  updates: {
    plannedQuantity?: number;
    expectedYield?: number;
    actualYield?: number;
    lossQty?: number;
    lossReason?: string;
    manufactureDate?: Date;
    expirationDate?: Date;
    productionDate?: Date;
    notes?: string;
  },
  userId: string
): Promise<void> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { product: true }
  });

  if (!batch) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
  }

  const before = {
    plannedQuantity: batch.plannedQuantity,
    expectedYield: batch.expectedYield,
    actualYield: batch.actualYield,
    lossQty: batch.lossQty,
    lossReason: batch.lossReason,
    manufactureDate: batch.manufactureDate,
    expirationDate: batch.expirationDate,
    productionDate: batch.productionDate,
    notes: batch.notes
  };

  await prisma.batch.update({
    where: { id: batchId },
    data: {
      plannedQuantity: updates.plannedQuantity,
      expectedYield: updates.expectedYield,
      actualYield: updates.actualYield,
      lossQty: updates.lossQty,
      lossReason: updates.lossReason,
      manufactureDate: updates.manufactureDate,
      expirationDate: updates.expirationDate,
      productionDate: updates.productionDate,
      notes: updates.notes
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.BATCH,
    entityId: batchId,
    action: 'updated',
    userId,
    summary: generateSummary({
      userName: user?.name || 'User',
      action: 'updated',
      entityName: `batch ${batch.batchCode}`
    }),
    before,
    after: updates,
    metadata: {
      batchCode: batch.batchCode,
      productName: batch.product.name
    },
    tags: ['updated']
  });
}

/**
 * Update batch status and track progression
 */
export async function updateBatchStatus(
  batchId: string,
  status: BatchStatus,
  userId: string,
  notes?: string
): Promise<void> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { product: true }
  });

  if (!batch) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
  }

  const before = { status: batch.status, notes: batch.notes };

  await prisma.batch.update({
    where: { id: batchId },
    data: {
      status,
      notes: notes || batch.notes
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.BATCH,
    entityId: batchId,
    action: 'status_updated',
    userId,
    summary: generateSummary({
      userName: user?.name || 'User',
      action: 'updated',
      entityName: `batch ${batch.batchCode}`,
      metadata: {
        status: status
      }
    }),
    before,
    after: { status, notes: notes ?? null },
    metadata: {
      previousStatus: batch.status,
      newStatus: status
    }
  });
}

/**
 * Assign makers to a batch
 */
export async function assignMakers(
  batchId: string,
  makerIds: string[],
  userId: string
): Promise<void> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { makers: true }
  });

  if (!batch) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
  }

  // Remove existing makers
  await prisma.batchMaker.deleteMany({
    where: { batchId }
  });

  // Add new makers
  await prisma.batchMaker.createMany({
    data: makerIds.map(makerId => ({
      batchId,
      userId: makerId
    }))
  });

  const makers = await prisma.user.findMany({
    where: { id: { in: makerIds } }
  });

  await logAction({
    entityType: ActivityEntity.BATCH,
    entityId: batchId,
    action: 'makers_assigned',
    userId,
    summary: `Makers assigned to batch ${batch.batchCode}: ${makers.map(m => m.name).join(', ')}`,
    before: {
      makers: batch.makers.map(m => m.userId)
    },
    after: {
      makers: makerIds
    },
    metadata: {
      makerNames: makers.map(m => m.name)
    },
    tags: ['assignment']
  });
}

/**
 * Complete a batch and create finished goods inventory
 */
export async function completeBatch(params: {
  batchId: string;
  actualQuantity: number;
  locationId: string;
  productionDate?: Date;
  manufactureDate?: Date;
  expirationDate?: Date;
  expectedYield?: number;
  lossQty?: number;
  lossReason?: string;
  qcRequired?: boolean;
  unitCost?: number;
  userId: string;
}): Promise<void> {
  const {
    batchId,
    actualQuantity,
    locationId,
    productionDate,
    manufactureDate,
    expirationDate,
    expectedYield,
    lossQty,
    lossReason,
    qcRequired,
    unitCost,
    userId
  } = params;

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { product: true }
  });

  if (!batch) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
  }

  if (batch.status === BatchStatus.RELEASED || batch.status === BatchStatus.EXHAUSTED) {
    throw new AppError(
      ErrorCodes.INVALID_STATUS,
      'Batch already completed'
    );
  }

  const location = await prisma.location.findUnique({
    where: { id: locationId }
  });

  if (!location) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Location not found');
  }

  // Calculate yield if expected yield provided
  const calculatedExpectedYield = expectedYield ?? batch.plannedQuantity;
  const actualYield = actualQuantity;
  const calculatedLoss = lossQty ?? Math.max(0, calculatedExpectedYield - actualYield);

  // Determine batch status based on QC requirement
  const newStatus = qcRequired ? BatchStatus.QC_HOLD : BatchStatus.RELEASED;
  const qcStatus = qcRequired ? QCStatus.PENDING : QCStatus.NOT_REQUIRED;

  // Update batch
  const before = {
    status: batch.status,
    actualQuantity: batch.actualQuantity,
    productionDate: batch.productionDate,
    qcStatus: batch.qcStatus,
    actualYield: batch.actualYield ?? null,
    expectedYield: batch.expectedYield ?? null,
    lossQty: batch.lossQty ?? null
  };

  await prisma.batch.update({
    where: { id: batchId },
    data: {
      actualQuantity,
      actualYield,
      expectedYield: calculatedExpectedYield,
      lossQty: calculatedLoss,
      lossReason: lossReason || null,
      productionDate: productionDate || new Date(),
      manufactureDate: manufactureDate || new Date(),
      expirationDate,
      status: newStatus,
      qcStatus
    }
  });

  // Create inventory item for finished goods using inventory service
  const inventoryItemId = await produceFinishedGoods({
    productId: batch.productId,
    batchId: batch.id,
    quantity: actualQuantity,
    locationId,
    unitCost,
    productionOrderId: batch.productionOrderId || undefined,
    userId
  });

  // If QC required, update the inventory status to quarantined
  if (qcRequired) {
    await prisma.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { status: InventoryStatus.QUARANTINED }
    });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  await logAction({
    entityType: ActivityEntity.BATCH,
    entityId: batchId,
    action: 'completed',
    userId,
    summary: generateSummary({
      userName: user?.name || 'User',
      action: 'completed',
      entityName: `batch ${batch.batchCode}`,
      metadata: {
        quantity: actualQuantity,
        location: location.name
      }
    }),
    before,
    after: {
      status: newStatus,
      actualQuantity,
      actualYield,
      expectedYield: calculatedExpectedYield,
      lossQty: calculatedLoss,
      productionDate: productionDate || new Date(),
      qcStatus
    },
    metadata: {
      productName: batch.product.name,
      actualQuantity,
      actualYield,
      expectedYield: calculatedExpectedYield,
      lossQty: calculatedLoss,
      lossReason,
      locationName: location.name,
      inventoryItemId,
      qcRequired: !!qcRequired
    },
    tags: qcRequired ? ['completed', 'qc_pending'] : ['completed']
  });

  // Update production order status if linked
  if (batch.productionOrderId) {
    await updateProductionOrderProgress(batch.productionOrderId);
  }
}

/**
 * Update production order progress based on batch completion
 */
async function updateProductionOrderProgress(productionOrderId: string): Promise<void> {
  const productionOrder = await prisma.productionOrder.findUnique({
    where: { id: productionOrderId },
    include: {
      batches: true
    }
  });

  if (!productionOrder) return;

  const totalCompleted = productionOrder.batches
    .filter(b => b.status === BatchStatus.RELEASED)
    .reduce((sum, b) => sum + (b.actualQuantity || 0), 0);

  let newStatus = productionOrder.status;

  if (totalCompleted >= productionOrder.quantityToMake) {
    newStatus = ProductionStatus.COMPLETED;
  } else if (totalCompleted > 0 && productionOrder.status === ProductionStatus.PLANNED) {
    newStatus = ProductionStatus.IN_PROGRESS;
  }

  if (newStatus !== productionOrder.status) {
    await prisma.productionOrder.update({
      where: { id: productionOrderId },
      data: { status: newStatus }
    });

    await logAction({
      entityType: ActivityEntity.PRODUCTION_ORDER,
      entityId: productionOrderId,
      action: 'status_updated',
      userId: undefined,
      summary: `Production order ${productionOrder.orderNumber} status changed to ${newStatus}`,
      before: { status: productionOrder.status },
      after: { status: newStatus },
      metadata: {
        totalCompleted,
        quantityToMake: productionOrder.quantityToMake
      },
      tags: ['system']
    });
  }
}


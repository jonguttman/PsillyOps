// PRINT JOB SERVICE - Paper usage tracking for label printing

import { prisma } from '@/lib/db/prisma';
import { logAction } from './loggingService';
import { ActivityEntity, LabelEntityType, PrintJobStatus } from '@prisma/client';
import { MaterialCategory } from '@/lib/types/enums';

/**
 * Resolve paper material from product BOM
 * Returns the first paper material found in the BOM, or null if none
 */
export async function resolvePaperMaterialFromBOM(productId: string): Promise<string | null> {
  // Get all materials in this product's BOM
  const bomItems = await prisma.bOMItem.findMany({
    where: {
      productId,
      active: true
    },
    include: {
      material: {
        select: {
          id: true,
          category: true,
          active: true
        }
      }
    }
  });

  // Find first paper material (checking multiple paper-related categories)
  const paperMaterial = bomItems.find(
    item => 
      item.material.active && 
      (item.material.category === MaterialCategory.LABELS ||
       item.material.category === MaterialCategory.PAPER_PRINT)
  );

  return paperMaterial?.material.id || null;
}

/**
 * Create a print job record
 */
export async function createPrintJob(params: {
  entityType: LabelEntityType;
  entityId: string;
  versionId: string;
  quantity: number;
  sheets: number;
  userId?: string;
}) {
  const { entityType, entityId, versionId, quantity, sheets, userId } = params;

  // Resolve paper material from BOM if entity is a product
  let paperMaterialId: string | null = null;
  if (entityType === 'PRODUCT') {
    paperMaterialId = await resolvePaperMaterialFromBOM(entityId);
  }

  // Create print job
  const printJob = await prisma.printJob.create({
    data: {
      entityType,
      entityId,
      versionId,
      quantity,
      sheets,
      paperMaterialId,
      createdById: userId,
      status: PrintJobStatus.CREATED
    }
  });

  // Log creation
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: printJob.id,
    action: 'print_job_created',
    userId,
    summary: `Created print job: ${quantity} labels on ${sheets} sheet(s)`,
    metadata: {
      entityType,
      entityId,
      quantity,
      sheets,
      paperMaterialId,
      paperTracking: paperMaterialId ? 'enabled' : 'disabled'
    },
    tags: ['print', 'label', 'created']
  });

  return printJob;
}

/**
 * Mark paper as used for a print job
 * This creates an inventory adjustment and updates the print job status
 */
export async function markPaperUsed(
  printJobId: string,
  sheetsUsed?: number,
  userId?: string
) {
  const printJob = await prisma.printJob.findUnique({
    where: { id: printJobId },
    include: {
      createdBy: {
        select: { name: true }
      }
    }
  });

  if (!printJob) {
    throw new Error('Print job not found');
  }

  if (printJob.status === PrintJobStatus.PAPER_USED) {
    throw new Error('Paper already marked as used for this print job');
  }

  if (!printJob.paperMaterialId) {
    throw new Error('Paper tracking is not enabled for this print job');
  }

  const actualSheetsUsed = sheetsUsed || printJob.sheets;

  // Get material and location info
  const material = await prisma.rawMaterial.findUnique({
    where: { id: printJob.paperMaterialId },
    select: { name: true, unitOfMeasure: true }
  });

  if (!material) {
    throw new Error('Paper material not found');
  }

  // Get a location for the inventory adjustment (use first available)
  const location = await prisma.location.findFirst({
    select: { id: true, name: true }
  });

  if (!location) {
    throw new Error('No location found for inventory adjustment');
  }

  // Find or create inventory item for this material
  let inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      materialId: printJob.paperMaterialId,
      locationId: location.id,
      status: 'AVAILABLE'
    }
  });

  if (!inventoryItem) {
    // Create inventory item if it doesn't exist
    inventoryItem = await prisma.inventoryItem.create({
      data: {
        type: 'MATERIAL',
        materialId: printJob.paperMaterialId,
        locationId: location.id,
        quantityOnHand: 0,
        unitOfMeasure: material.unitOfMeasure,
        status: 'AVAILABLE',
        source: 'MANUAL'
      }
    });
  }

  // Create inventory adjustment (negative quantity for consumption)
  await prisma.inventoryAdjustment.create({
    data: {
      inventoryId: inventoryItem.id,
      deltaQty: -actualSheetsUsed,
      reason: `Paper used for print job (${printJob.quantity} labels)`,
      adjustmentType: 'CONSUMPTION',
      relatedEntityType: ActivityEntity.LABEL,
      relatedEntityId: printJob.id,
      createdById: userId
    }
  });

  // Update inventory quantity
  await prisma.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: {
      quantityOnHand: {
        decrement: actualSheetsUsed
      }
    }
  });

  // Update material stock
  await prisma.rawMaterial.update({
    where: { id: printJob.paperMaterialId },
    data: {
      currentStockQty: {
        decrement: actualSheetsUsed
      }
    }
  });

  // Update print job status
  const updatedPrintJob = await prisma.printJob.update({
    where: { id: printJobId },
    data: {
      status: PrintJobStatus.PAPER_USED,
      paperUsedAt: new Date()
    }
  });

  // Log the paper usage
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: printJob.id,
    action: 'print_job_paper_used',
    userId,
    summary: `Paper used: ${actualSheetsUsed} sheet(s) for ${printJob.quantity} labels`,
    metadata: {
      printJobId,
      materialId: printJob.paperMaterialId,
      materialName: material.name,
      sheetsUsed: actualSheetsUsed,
      locationId: location.id,
      locationName: location.name
    },
    tags: ['print', 'paper', 'inventory', 'consumption']
  });

  return updatedPrintJob;
}

/**
 * Void a print job (mark as voided without using paper)
 */
export async function voidPrintJob(printJobId: string, userId?: string) {
  const printJob = await prisma.printJob.findUnique({
    where: { id: printJobId }
  });

  if (!printJob) {
    throw new Error('Print job not found');
  }

  if (printJob.status === PrintJobStatus.PAPER_USED) {
    throw new Error('Cannot void a print job with paper already used');
  }

  const updatedPrintJob = await prisma.printJob.update({
    where: { id: printJobId },
    data: {
      status: PrintJobStatus.VOIDED
    }
  });

  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: printJob.id,
    action: 'print_job_voided',
    userId,
    summary: `Voided print job: ${printJob.quantity} labels`,
    tags: ['print', 'voided']
  });

  return updatedPrintJob;
}

/**
 * Get print job by ID
 */
export async function getPrintJob(printJobId: string) {
  return await prisma.printJob.findUnique({
    where: { id: printJobId },
    include: {
      createdBy: {
        select: { id: true, name: true }
      }
    }
  });
}

/**
 * Get print jobs for an entity
 */
export async function getPrintJobsForEntity(
  entityType: LabelEntityType,
  entityId: string
) {
  return await prisma.printJob.findMany({
    where: {
      entityType,
      entityId
    },
    include: {
      createdBy: {
        select: { id: true, name: true }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
}


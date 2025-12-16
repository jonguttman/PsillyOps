// MATERIAL SERVICE - Material management, cost tracking, and vendor relationships

import { prisma } from '@/lib/db/prisma';
import { logAction, generateSummary } from './loggingService';
import { ActivityEntity } from '@prisma/client';
import { MaterialCategory } from '@/lib/types/enums';

export interface MaterialWithVendors {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
  category: string;
  description: string | null;
  currentStockQty: number;
  reorderPoint: number;
  reorderQuantity: number;
  moq: number;
  leadTimeDays: number;
  active: boolean;
  preferredVendorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  preferredVendor: {
    id: string;
    name: string;
  } | null;
  vendors: Array<{
    id: string;
    vendorId: string;
    vendorName: string;
    leadTimeDays: number | null;
    lastPrice: number | null;
    moq: number;
    preferred: boolean;
    notes: string | null;
  }>;
  currentCost: number | null;
  inventorySummary: Record<string, number>;
  recentCostHistory: Array<{
    id: string;
    price: number;
    source: string;
    vendorName: string | null;
    createdAt: Date;
  }>;
}

/**
 * Get material with full vendor relationships, inventory summary, and cost history
 */
export async function getMaterialWithVendors(materialId: string): Promise<MaterialWithVendors | null> {
  const material = await prisma.rawMaterial.findUnique({
    where: { id: materialId },
    include: {
      preferredVendor: {
        select: { id: true, name: true }
      },
      vendors: {
        include: {
          vendor: {
            select: { id: true, name: true }
          }
        },
        orderBy: { preferred: 'desc' }
      },
      inventory: {
        where: { status: 'AVAILABLE' },
        include: {
          location: {
            select: { name: true }
          }
        }
      },
      costHistory: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          vendor: {
            select: { name: true }
          }
        }
      }
    }
  });

  if (!material) {
    return null;
  }

  // Calculate inventory summary by location
  const inventorySummary: Record<string, number> = {};
  for (const inv of material.inventory) {
    const locName = inv.location.name;
    inventorySummary[locName] = (inventorySummary[locName] || 0) + inv.quantityOnHand;
  }

  // Calculate current cost from preferred vendor or lowest price
  let currentCost: number | null = null;
  const preferredMv = material.vendors.find(mv => mv.preferred);
  if (preferredMv?.lastPrice) {
    currentCost = preferredMv.lastPrice;
  } else {
    // Find lowest price from any vendor
    const prices = material.vendors
      .filter(mv => mv.lastPrice != null)
      .map(mv => mv.lastPrice as number);
    if (prices.length > 0) {
      currentCost = Math.min(...prices);
    }
  }

  return {
    id: material.id,
    name: material.name,
    sku: material.sku,
    unitOfMeasure: material.unitOfMeasure,
    category: material.category,
    description: material.description,
    currentStockQty: material.currentStockQty,
    reorderPoint: material.reorderPoint,
    reorderQuantity: material.reorderQuantity,
    moq: material.moq,
    leadTimeDays: material.leadTimeDays,
    active: material.active,
    preferredVendorId: material.preferredVendorId,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
    preferredVendor: material.preferredVendor,
    vendors: material.vendors.map(mv => ({
      id: mv.id,
      vendorId: mv.vendorId,
      vendorName: mv.vendor.name,
      leadTimeDays: mv.leadTimeDays,
      lastPrice: mv.lastPrice,
      moq: mv.moq,
      preferred: mv.preferred,
      notes: mv.notes
    })),
    currentCost,
    inventorySummary,
    recentCostHistory: material.costHistory.map(ch => ({
      id: ch.id,
      price: ch.price,
      source: ch.source,
      vendorName: ch.vendor?.name || null,
      createdAt: ch.createdAt
    }))
  };
}

/**
 * Set the preferred vendor for a material
 * Ensures only one vendor is preferred per material
 */
export async function setPreferredVendor(
  materialId: string,
  vendorId: string,
  userId?: string
): Promise<void> {
  const material = await prisma.rawMaterial.findUnique({
    where: { id: materialId },
    include: {
      vendors: {
        include: { vendor: true }
      }
    }
  });

  if (!material) {
    throw new Error('Material not found');
  }

  const targetMv = material.vendors.find(mv => mv.vendorId === vendorId);
  if (!targetMv) {
    throw new Error('Vendor relationship not found for this material');
  }

  // Transaction: unset all preferred, set the new one
  await prisma.$transaction([
    // Unset all preferred for this material
    prisma.materialVendor.updateMany({
      where: { materialId },
      data: { preferred: false }
    }),
    // Set the target vendor as preferred
    prisma.materialVendor.update({
      where: { id: targetMv.id },
      data: { preferred: true }
    }),
    // Update the preferredVendorId on the material
    prisma.rawMaterial.update({
      where: { id: materialId },
      data: { preferredVendorId: vendorId }
    })
  ]);

  // Log the action
  await logAction({
    entityType: ActivityEntity.MATERIAL,
    entityId: materialId,
    action: 'set_preferred_vendor',
    userId,
    summary: generateSummary({
      action: 'updated',
      entityName: `preferred vendor for ${material.name} to ${targetMv.vendor.name}`
    }),
    before: { preferredVendorId: material.preferredVendorId },
    after: { preferredVendorId: vendorId },
    tags: ['vendor', 'cost', 'preference']
  });
}

/**
 * Clear preferred vendor for a material
 */
export async function clearPreferredVendor(
  materialId: string,
  userId?: string
): Promise<void> {
  const material = await prisma.rawMaterial.findUnique({
    where: { id: materialId }
  });

  if (!material) {
    throw new Error('Material not found');
  }

  await prisma.$transaction([
    prisma.materialVendor.updateMany({
      where: { materialId },
      data: { preferred: false }
    }),
    prisma.rawMaterial.update({
      where: { id: materialId },
      data: { preferredVendorId: null }
    })
  ]);

  await logAction({
    entityType: ActivityEntity.MATERIAL,
    entityId: materialId,
    action: 'clear_preferred_vendor',
    userId,
    summary: `Cleared preferred vendor for ${material.name}`,
    before: { preferredVendorId: material.preferredVendorId },
    after: { preferredVendorId: null },
    tags: ['vendor', 'preference']
  });
}

/**
 * Record a cost change for a material
 * Creates a MaterialCostHistory entry and optionally updates MaterialVendor.lastPrice
 */
export async function recordCostChange(
  materialId: string,
  vendorId: string | null,
  price: number,
  source: string = 'MANUAL',
  notes?: string,
  userId?: string
): Promise<void> {
  const material = await prisma.rawMaterial.findUnique({
    where: { id: materialId }
  });

  if (!material) {
    throw new Error('Material not found');
  }

  let vendorName: string | null = null;

  // Create cost history entry
  await prisma.materialCostHistory.create({
    data: {
      materialId,
      vendorId,
      price,
      source,
      notes
    }
  });

  // If vendor is specified, update the MaterialVendor.lastPrice
  if (vendorId) {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId }
    });
    vendorName = vendor?.name || null;

    await prisma.materialVendor.updateMany({
      where: {
        materialId,
        vendorId
      },
      data: { lastPrice: price }
    });
  }

  // Log the action
  await logAction({
    entityType: ActivityEntity.MATERIAL,
    entityId: materialId,
    action: 'cost_update',
    userId,
    summary: `Recorded new cost $${price.toFixed(2)} for ${material.name}${vendorName ? ` from ${vendorName}` : ''}`,
    metadata: {
      price,
      source,
      vendorId,
      vendorName
    },
    tags: ['cost', 'price_change']
  });
}

/**
 * Get cost history for a material
 */
export async function getMaterialCostHistory(
  materialId: string,
  limit: number = 50
) {
  return await prisma.materialCostHistory.findMany({
    where: { materialId },
    include: {
      vendor: {
        select: { id: true, name: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

/**
 * Calculate current material cost
 * Returns the cost from preferred vendor, or lowest available price
 */
export async function calculateMaterialCost(materialId: string): Promise<number | null> {
  const material = await prisma.rawMaterial.findUnique({
    where: { id: materialId },
    include: {
      vendors: {
        select: {
          lastPrice: true,
          preferred: true
        }
      }
    }
  });

  if (!material) {
    return null;
  }

  // Preferred vendor price takes precedence
  const preferredMv = material.vendors.find(mv => mv.preferred);
  if (preferredMv?.lastPrice) {
    return preferredMv.lastPrice;
  }

  // Otherwise, return lowest price
  const prices = material.vendors
    .filter(mv => mv.lastPrice != null)
    .map(mv => mv.lastPrice as number);

  if (prices.length > 0) {
    return Math.min(...prices);
  }

  return null;
}

/**
 * Get all materials with basic info for list view
 */
export async function getMaterialsList(includeInactive: boolean = false) {
  const where = includeInactive ? {} : { active: true };

  return await prisma.rawMaterial.findMany({
    where,
    include: {
      preferredVendor: {
        select: { id: true, name: true }
      },
      vendors: {
        where: { preferred: true },
        select: { lastPrice: true }
      },
      _count: {
        select: {
          inventory: true,
          bomUsage: true
        }
      }
    },
    orderBy: { name: 'asc' }
  });
}

/**
 * Create a new material
 */
export async function createMaterial(
  data: {
    name: string;
    sku: string;
    unitOfMeasure: string;
    category: string;
    description?: string;
    reorderPoint?: number;
    reorderQuantity?: number;
    moq?: number;
    leadTimeDays?: number;
  },
  userId?: string
) {
  if (!data.category || !Object.values(MaterialCategory).includes(data.category as MaterialCategory)) {
    throw new Error('Category is required');
  }

  const material = await prisma.rawMaterial.create({
    data: {
      name: data.name,
      sku: data.sku,
      unitOfMeasure: data.unitOfMeasure,
      category: data.category,
      description: data.description,
      reorderPoint: data.reorderPoint || 0,
      reorderQuantity: data.reorderQuantity || 0,
      moq: data.moq || 0,
      leadTimeDays: data.leadTimeDays || 0,
      active: true
    }
  });

  await logAction({
    entityType: ActivityEntity.MATERIAL,
    entityId: material.id,
    action: 'created',
    userId,
    summary: generateSummary({
      action: 'created',
      entityName: `material ${material.name} (${material.sku})`
    }),
    tags: ['created', 'material']
  });

  return material;
}

/**
 * Update a material
 */
export async function updateMaterial(
  materialId: string,
  data: {
    name?: string;
    sku?: string;
    unitOfMeasure?: string;
    category?: string;
    description?: string;
    reorderPoint?: number;
    reorderQuantity?: number;
    moq?: number;
    leadTimeDays?: number;
    active?: boolean;
  },
  userId?: string
) {
  const before = await prisma.rawMaterial.findUnique({
    where: { id: materialId }
  });

  if (!before) {
    throw new Error('Material not found');
  }

  if (data.category !== undefined && !Object.values(MaterialCategory).includes(data.category as MaterialCategory)) {
    throw new Error('Category is required');
  }

  const material = await prisma.rawMaterial.update({
    where: { id: materialId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.sku !== undefined && { sku: data.sku }),
      ...(data.unitOfMeasure !== undefined && { unitOfMeasure: data.unitOfMeasure }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.reorderPoint !== undefined && { reorderPoint: data.reorderPoint }),
      ...(data.reorderQuantity !== undefined && { reorderQuantity: data.reorderQuantity }),
      ...(data.moq !== undefined && { moq: data.moq }),
      ...(data.leadTimeDays !== undefined && { leadTimeDays: data.leadTimeDays }),
      ...(data.active !== undefined && { active: data.active })
    }
  });

  await logAction({
    entityType: ActivityEntity.MATERIAL,
    entityId: material.id,
    action: 'updated',
    userId,
    summary: generateSummary({
      action: 'updated',
      entityName: `material ${material.name}`
    }),
    before,
    after: material,
    tags: ['updated', 'material']
  });

  return material;
}

/**
 * Archive (soft delete) a material
 */
export async function archiveMaterial(materialId: string, userId?: string) {
  const material = await prisma.rawMaterial.update({
    where: { id: materialId },
    data: { 
      active: false,
      archivedAt: new Date()
    }
  });

  await logAction({
    entityType: ActivityEntity.MATERIAL,
    entityId: material.id,
    action: 'material_archived',
    userId,
    summary: `Archived material ${material.name}`,
    tags: ['archived', 'material']
  });

  return material;
}

/**
 * Check if a material can be deleted (hard delete)
 * Returns { canDelete: boolean, reason?: string }
 */
export async function canDeleteMaterial(materialId: string): Promise<{ canDelete: boolean; reason?: string }> {
  const material = await prisma.rawMaterial.findUnique({
    where: { id: materialId },
    include: {
      inventory: true,
      poLineItems: true,
      bomUsage: true
    }
  });

  if (!material) {
    return { canDelete: false, reason: 'Material not found' };
  }

  if (!material.archivedAt) {
    return { canDelete: false, reason: 'Material must be archived before deletion' };
  }

  if (material.inventory.length > 0) {
    return { canDelete: false, reason: 'Material has inventory records' };
  }

  if (material.poLineItems.length > 0) {
    return { canDelete: false, reason: 'Material has purchase order line items' };
  }

  if (material.bomUsage.length > 0) {
    return { canDelete: false, reason: 'Material is used in product BOMs' };
  }

  return { canDelete: true };
}

/**
 * Permanently delete a material (hard delete)
 * Only allowed if material is archived and has no dependencies
 */
export async function deleteMaterial(materialId: string, userId?: string) {
  // Check if deletion is allowed
  const checkResult = await canDeleteMaterial(materialId);
  
  if (!checkResult.canDelete) {
    throw new Error(checkResult.reason || 'Cannot delete material');
  }

  // Get material snapshot for logging
  const material = await prisma.rawMaterial.findUnique({
    where: { id: materialId }
  });

  if (!material) {
    throw new Error('Material not found');
  }

  // Create snapshot for audit log
  const materialSnapshot = {
    id: material.id,
    name: material.name,
    sku: material.sku,
    category: material.category,
    unitOfMeasure: material.unitOfMeasure,
    archivedAt: material.archivedAt
  };

  // Delete the material
  await prisma.rawMaterial.delete({
    where: { id: materialId }
  });

  // Log the deletion
  await logAction({
    entityType: ActivityEntity.MATERIAL,
    entityId: materialId,
    action: 'material_deleted',
    userId,
    summary: `Permanently deleted material ${material.name}`,
    metadata: { materialSnapshot },
    tags: ['deleted', 'material', 'permanent']
  });

  return materialSnapshot;
}

/**
 * Create or update a material-vendor relationship
 */
export async function upsertMaterialVendor(
  data: {
    materialId: string;
    vendorId: string;
    leadTimeDays?: number;
    lastPrice?: number;
    moq?: number;
    preferred?: boolean;
    notes?: string;
  },
  userId?: string
) {
  const material = await prisma.rawMaterial.findUnique({
    where: { id: data.materialId }
  });
  const vendor = await prisma.vendor.findUnique({
    where: { id: data.vendorId }
  });

  if (!material || !vendor) {
    throw new Error('Material or Vendor not found');
  }

  // If setting as preferred, unset others first
  if (data.preferred) {
    await prisma.materialVendor.updateMany({
      where: { materialId: data.materialId },
      data: { preferred: false }
    });
    await prisma.rawMaterial.update({
      where: { id: data.materialId },
      data: { preferredVendorId: data.vendorId }
    });
  }

  const result = await prisma.materialVendor.upsert({
    where: {
      materialId_vendorId: {
        materialId: data.materialId,
        vendorId: data.vendorId
      }
    },
    create: {
      materialId: data.materialId,
      vendorId: data.vendorId,
      leadTimeDays: data.leadTimeDays,
      lastPrice: data.lastPrice,
      moq: data.moq || 0,
      preferred: data.preferred || false,
      notes: data.notes
    },
    update: {
      ...(data.leadTimeDays !== undefined && { leadTimeDays: data.leadTimeDays }),
      ...(data.lastPrice !== undefined && { lastPrice: data.lastPrice }),
      ...(data.moq !== undefined && { moq: data.moq }),
      ...(data.preferred !== undefined && { preferred: data.preferred }),
      ...(data.notes !== undefined && { notes: data.notes })
    }
  });

  // If price was set, also record in cost history
  if (data.lastPrice !== undefined) {
    await recordCostChange(
      data.materialId,
      data.vendorId,
      data.lastPrice,
      'VENDOR_UPDATE',
      undefined,
      userId
    );
  }

  await logAction({
    entityType: ActivityEntity.MATERIAL,
    entityId: data.materialId,
    action: 'vendor_relationship_updated',
    userId,
    summary: `Updated vendor relationship: ${material.name} with ${vendor.name}`,
    metadata: {
      vendorId: data.vendorId,
      vendorName: vendor.name,
      price: data.lastPrice,
      preferred: data.preferred
    },
    tags: ['vendor', 'relationship']
  });

  return result;
}

/**
 * Remove a material-vendor relationship
 */
export async function removeMaterialVendor(
  materialVendorId: string,
  userId?: string
) {
  const mv = await prisma.materialVendor.findUnique({
    where: { id: materialVendorId },
    include: {
      material: true,
      vendor: true
    }
  });

  if (!mv) {
    throw new Error('Material-Vendor relationship not found');
  }

  // If this was the preferred vendor, clear it
  if (mv.preferred) {
    await prisma.rawMaterial.update({
      where: { id: mv.materialId },
      data: { preferredVendorId: null }
    });
  }

  await prisma.materialVendor.delete({
    where: { id: materialVendorId }
  });

  await logAction({
    entityType: ActivityEntity.MATERIAL,
    entityId: mv.materialId,
    action: 'vendor_relationship_removed',
    userId,
    summary: `Removed vendor ${mv.vendor.name} from ${mv.material.name}`,
    tags: ['vendor', 'relationship', 'deleted']
  });
}


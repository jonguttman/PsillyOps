/**
 * Transparency Service
 * 
 * Handles CRUD operations for Product Transparency system:
 * - Transparency Records (per product/batch)
 * - Lab Registry
 * - System Config (public copy)
 * 
 * All changes are logged via ActivityLog.
 */

import { prisma } from '@/lib/db/prisma';
import { ActivityEntity, TransparencyResult } from '@prisma/client';
import { logAction } from '@/lib/services/loggingService';

// ============================================
// TYPES
// ============================================

export interface CreateTransparencyRecordParams {
  entityType: ActivityEntity;
  entityId: string;
  productionDate: Date;
  batchCode?: string | null;
  labId?: string | null;
  testDate?: Date | null;
  testResult?: TransparencyResult | null;
  rawMaterialLinked?: boolean;
  publicDescription?: string | null;
}

export interface UpdateTransparencyRecordParams {
  productionDate?: Date;
  batchCode?: string | null;
  labId?: string | null;
  testDate?: Date | null;
  testResult?: TransparencyResult | null;
  rawMaterialLinked?: boolean;
  publicDescription?: string | null;
}

export interface CreateLabParams {
  name: string;
  location: string;
  description?: string | null;
  active?: boolean;
}

export interface UpdateLabParams {
  name?: string;
  location?: string;
  description?: string | null;
  active?: boolean;
}

export interface TransparencyRecordFilters {
  entityType?: ActivityEntity;
  testResult?: TransparencyResult;
  search?: string;
}

// ============================================
// TRANSPARENCY RECORDS
// ============================================

/**
 * Get the latest (by testDate) transparency record for a given entity.
 * Used for public display - excludes FAIL results.
 */
export async function getPublicTransparencyRecord(
  entityType: ActivityEntity,
  entityId: string
) {
  const record = await prisma.transparencyRecord.findFirst({
    where: {
      entityType,
      entityId,
      // Exclude FAIL results from public display
      testResult: { not: 'FAIL' },
    },
    orderBy: { testDate: 'desc' },
    include: {
      lab: true,
    },
  });

  return record;
}

/**
 * Get a transparency record by ID (admin use).
 * Includes all results including FAIL.
 */
export async function getTransparencyRecordById(id: string) {
  return prisma.transparencyRecord.findUnique({
    where: { id },
    include: { lab: true },
  });
}

/**
 * List all transparency records with filters (admin use).
 */
export async function listTransparencyRecords(filters?: TransparencyRecordFilters) {
  const where: Record<string, unknown> = {};

  if (filters?.entityType) {
    where.entityType = filters.entityType;
  }

  if (filters?.testResult) {
    where.testResult = filters.testResult;
  }

  return prisma.transparencyRecord.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { lab: true },
  });
}

/**
 * Create a new transparency record.
 * Automatically snapshots lab name for historical accuracy.
 */
export async function createTransparencyRecord(
  params: CreateTransparencyRecordParams,
  userId: string
) {
  // Get lab name for snapshot if labId provided
  let labNameSnapshot = '';
  if (params.labId) {
    const lab = await prisma.lab.findUnique({
      where: { id: params.labId },
      select: { name: true },
    });
    labNameSnapshot = lab?.name || '';
  }

  const record = await prisma.transparencyRecord.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      productionDate: params.productionDate,
      batchCode: params.batchCode,
      labId: params.labId,
      labNameSnapshot,
      testDate: params.testDate,
      testResult: params.testResult,
      rawMaterialLinked: params.rawMaterialLinked ?? true,
      publicDescription: params.publicDescription,
    },
    include: { lab: true },
  });

  // Log activity
  await logAction({
    entityType: params.entityType,
    entityId: params.entityId,
    action: 'TRANSPARENCY_RECORD_CREATED',
    userId,
    summary: `Created transparency record for ${params.entityType} ${params.entityId}`,
    metadata: {
      recordId: record.id,
      testResult: params.testResult,
      labName: labNameSnapshot,
    },
  });

  return record;
}

/**
 * Update an existing transparency record.
 * Re-snapshots lab name if labId changes.
 */
export async function updateTransparencyRecord(
  id: string,
  params: UpdateTransparencyRecordParams,
  userId: string
) {
  const existing = await prisma.transparencyRecord.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Transparency record not found');
  }

  // Re-snapshot lab name if labId changed
  let labNameSnapshot = existing.labNameSnapshot;
  if (params.labId !== undefined && params.labId !== existing.labId) {
    if (params.labId) {
      const lab = await prisma.lab.findUnique({
        where: { id: params.labId },
        select: { name: true },
      });
      labNameSnapshot = lab?.name || '';
    } else {
      labNameSnapshot = '';
    }
  }

  const record = await prisma.transparencyRecord.update({
    where: { id },
    data: {
      ...params,
      labNameSnapshot,
    },
    include: { lab: true },
  });

  // Log activity
  await logAction({
    entityType: existing.entityType,
    entityId: existing.entityId,
    action: 'TRANSPARENCY_RECORD_UPDATED',
    userId,
    summary: `Updated transparency record for ${existing.entityType} ${existing.entityId}`,
    metadata: {
      recordId: record.id,
      changes: params,
    },
  });

  return record;
}

/**
 * Delete a transparency record.
 */
export async function deleteTransparencyRecord(id: string, userId: string) {
  const existing = await prisma.transparencyRecord.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Transparency record not found');
  }

  await prisma.transparencyRecord.delete({
    where: { id },
  });

  // Log activity
  await logAction({
    entityType: existing.entityType,
    entityId: existing.entityId,
    action: 'TRANSPARENCY_RECORD_DELETED',
    userId,
    summary: `Deleted transparency record for ${existing.entityType} ${existing.entityId}`,
    metadata: {
      recordId: id,
    },
  });
}

// ============================================
// LAB REGISTRY
// ============================================

/**
 * Get all labs (optionally filter by active status).
 */
export async function listLabs(activeOnly = false) {
  return prisma.lab.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { name: 'asc' },
  });
}

/**
 * Get a lab by ID.
 */
export async function getLabById(id: string) {
  return prisma.lab.findUnique({
    where: { id },
  });
}

/**
 * Create a new lab.
 */
export async function createLab(params: CreateLabParams, userId: string) {
  const lab = await prisma.lab.create({
    data: {
      name: params.name,
      location: params.location,
      description: params.description,
      active: params.active ?? true,
    },
  });

  // Log activity
  await logAction({
    entityType: 'SYSTEM' as ActivityEntity,
    entityId: lab.id,
    action: 'LAB_CREATED',
    userId,
    summary: `Created lab: ${params.name}`,
    metadata: {
      labId: lab.id,
      labName: params.name,
      location: params.location,
    },
  });

  return lab;
}

/**
 * Update an existing lab.
 */
export async function updateLab(id: string, params: UpdateLabParams, userId: string) {
  const existing = await prisma.lab.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Lab not found');
  }

  const lab = await prisma.lab.update({
    where: { id },
    data: params,
  });

  // Log activity
  await logAction({
    entityType: 'SYSTEM' as ActivityEntity,
    entityId: lab.id,
    action: 'LAB_UPDATED',
    userId,
    summary: `Updated lab: ${lab.name}`,
    metadata: {
      labId: lab.id,
      changes: params,
    },
  });

  return lab;
}

/**
 * Soft-delete a lab by deactivating it.
 */
export async function deactivateLab(id: string, userId: string) {
  return updateLab(id, { active: false }, userId);
}

// ============================================
// SYSTEM CONFIG (Public Copy)
// ============================================

/**
 * Default copy values for transparency pages.
 */
export const DEFAULT_COPY = {
  TRANSPARENCY_PASS_COPY: 'This product has passed third-party purity testing.',
  TRANSPARENCY_PENDING_COPY: 'Testing results are pending for this product.',
  TRANSPARENCY_FAIL_COPY: 'This product did not pass testing and has been removed from distribution.',
  TRANSPARENCY_RAW_MATERIAL_COPY: 'Raw materials used in this product are sourced from verified suppliers.',
  TRANSPARENCY_FOOTER_COPY: 'We are committed to transparency and quality in every product we make.',
} as const;

export type TransparencyCopyKey = keyof typeof DEFAULT_COPY;

/**
 * Get a single config value.
 */
export async function getSystemConfig(key: string): Promise<string | null> {
  const config = await prisma.systemConfig.findUnique({
    where: { key },
  });

  return config?.value ?? null;
}

/**
 * Get all transparency copy values.
 * Returns defaults for any missing keys.
 */
export async function getTransparencyCopy(): Promise<Record<TransparencyCopyKey, string>> {
  const configs = await prisma.systemConfig.findMany({
    where: {
      key: { in: Object.keys(DEFAULT_COPY) },
    },
  });

  // Create a mutable copy of defaults
  const result: Record<TransparencyCopyKey, string> = { ...DEFAULT_COPY };

  for (const config of configs) {
    if (config.key in result) {
      (result as Record<string, string>)[config.key] = config.value;
    }
  }

  return result;
}

/**
 * Set a single config value.
 */
export async function setSystemConfig(
  key: string,
  value: string,
  userId: string
) {
  const config = await prisma.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  // Log activity
  await logAction({
    entityType: 'SYSTEM' as ActivityEntity,
    entityId: key,
    action: 'SYSTEM_CONFIG_UPDATED',
    userId,
    summary: `Updated system config: ${key}`,
    metadata: {
      key,
      valueLength: value.length,
    },
  });

  return config;
}

/**
 * Bulk update transparency copy values.
 */
export async function updateTransparencyCopy(
  values: Partial<Record<TransparencyCopyKey, string>>,
  userId: string
) {
  const results = [];

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      const config = await setSystemConfig(key, value, userId);
      results.push(config);
    }
  }

  return results;
}

// ============================================
// ENTITY HELPERS
// ============================================

/**
 * Get entity details for display (product name, batch code, etc.).
 */
export async function getEntityDetails(
  entityType: ActivityEntity,
  entityId: string
): Promise<{ name: string; sku?: string; batchCode?: string } | null> {
  if (entityType === 'PRODUCT') {
    const product = await prisma.product.findUnique({
      where: { id: entityId },
      select: { name: true, sku: true },
    });
    return product ? { name: product.name, sku: product.sku } : null;
  }

  if (entityType === 'BATCH') {
    const batch = await prisma.batch.findUnique({
      where: { id: entityId },
      select: {
        batchCode: true,
        product: { select: { name: true, sku: true } },
      },
    });
    return batch
      ? {
          name: batch.product.name,
          sku: batch.product.sku,
          batchCode: batch.batchCode,
        }
      : null;
  }

  return null;
}


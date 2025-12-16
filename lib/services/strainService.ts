// STRAIN SERVICE - Manages strain lookup table
// Provides CRUD operations and resolution helpers for AI commands

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { ActivityEntity } from '@prisma/client';

// ========================================
// TYPES
// ========================================

export interface StrainData {
  name: string;
  shortCode: string;
  aliases?: string[];
}

export interface StrainFilter {
  includeInactive?: boolean;
  search?: string;
}

// ========================================
// LIST STRAINS
// ========================================

/**
 * List all strains with optional filtering
 */
export async function listStrains(filter: StrainFilter = {}) {
  const where: any = {};
  
  if (!filter.includeInactive) {
    where.active = true;
  }

  if (filter.search) {
    where.OR = [
      { name: { contains: filter.search } },
      { shortCode: { contains: filter.search } }
    ];
  }

  const strains = await prisma.strain.findMany({
    where,
    include: {
      _count: {
        select: { products: true }
      }
    },
    orderBy: { name: 'asc' }
  });

  return strains.map(strain => ({
    ...strain,
    aliases: parseAliases(strain.aliases),
    productCount: strain._count.products
  }));
}

// ========================================
// GET STRAIN
// ========================================

/**
 * Get a single strain by ID
 */
export async function getStrain(id: string) {
  const strain = await prisma.strain.findUnique({
    where: { id },
    include: {
      products: {
        where: { active: true },
        select: {
          id: true,
          name: true,
          sku: true
        },
        orderBy: { name: 'asc' }
      }
    }
  });

  if (!strain) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Strain not found');
  }

  return {
    ...strain,
    aliases: parseAliases(strain.aliases)
  };
}

/**
 * Get a strain by short code (case-insensitive)
 */
export async function getStrainByCode(shortCode: string) {
  const strain = await prisma.strain.findFirst({
    where: { 
      shortCode: shortCode.toUpperCase(),
      active: true 
    }
  });

  if (!strain) return null;

  return {
    ...strain,
    aliases: parseAliases(strain.aliases)
  };
}

/**
 * Get a strain by name (case-insensitive)
 */
export async function getStrainByName(name: string) {
  const strain = await prisma.strain.findFirst({
    where: { 
      name: { equals: name },
      active: true 
    }
  });

  if (!strain) return null;

  return {
    ...strain,
    aliases: parseAliases(strain.aliases)
  };
}

// ========================================
// RESOLVE STRAIN REFERENCE
// ========================================

/**
 * Resolve a strain reference from user input
 * Matches against: shortCode (preferred), name, aliases
 * Case-insensitive matching
 */
export async function resolveStrainRef(ref: string): Promise<{
  id: string;
  name: string;
  shortCode: string;
} | null> {
  const normalizedRef = ref.trim().toUpperCase();
  
  // 1. Try exact shortCode match (fastest)
  const byCode = await prisma.strain.findFirst({
    where: { 
      shortCode: normalizedRef,
      active: true 
    },
    select: { id: true, name: true, shortCode: true }
  });
  if (byCode) return byCode;

  // 2. Try exact name match (case-insensitive)
  const byName = await prisma.strain.findFirst({
    where: { 
      name: { equals: ref.trim() },
      active: true 
    },
    select: { id: true, name: true, shortCode: true }
  });
  if (byName) return byName;

  // 3. Try partial name match
  const byPartialName = await prisma.strain.findFirst({
    where: { 
      name: { contains: ref.trim() },
      active: true 
    },
    select: { id: true, name: true, shortCode: true }
  });
  if (byPartialName) return byPartialName;

  // 4. Search through aliases (requires fetching all active strains)
  const allStrains = await prisma.strain.findMany({
    where: { active: true },
    select: { id: true, name: true, shortCode: true, aliases: true }
  });

  for (const strain of allStrains) {
    const aliases = parseAliases(strain.aliases);
    for (const alias of aliases) {
      if (alias.toLowerCase() === ref.trim().toLowerCase()) {
        return { id: strain.id, name: strain.name, shortCode: strain.shortCode };
      }
    }
  }

  // 5. No match found
  return null;
}

// ========================================
// CREATE STRAIN
// ========================================

/**
 * Create a new strain
 */
export async function createStrain(data: StrainData, userId?: string) {
  // Validate unique shortCode
  const existingCode = await prisma.strain.findUnique({
    where: { shortCode: data.shortCode.toUpperCase() }
  });
  if (existingCode) {
    throw new AppError(ErrorCodes.DUPLICATE, `Strain with code "${data.shortCode}" already exists`);
  }

  // Validate unique name
  const existingName = await prisma.strain.findUnique({
    where: { name: data.name }
  });
  if (existingName) {
    throw new AppError(ErrorCodes.DUPLICATE, `Strain with name "${data.name}" already exists`);
  }

  const strain = await prisma.strain.create({
    data: {
      name: data.name.trim(),
      shortCode: data.shortCode.toUpperCase().trim(),
      aliases: JSON.stringify(data.aliases || []),
      active: true
    }
  });

  await logAction({
    entityType: ActivityEntity.SYSTEM,
    entityId: strain.id,
    action: 'strain_created',
    userId,
    summary: `Created strain "${strain.name}" (${strain.shortCode})`,
    metadata: { strainId: strain.id, name: strain.name, shortCode: strain.shortCode },
    tags: ['strain', 'created']
  });

  return {
    ...strain,
    aliases: parseAliases(strain.aliases)
  };
}

// ========================================
// UPDATE STRAIN
// ========================================

/**
 * Update an existing strain
 */
export async function updateStrain(
  id: string, 
  data: Partial<StrainData>, 
  userId?: string
) {
  const existing = await prisma.strain.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Strain not found');
  }

  // Check for duplicate shortCode if changing
  if (data.shortCode && data.shortCode.toUpperCase() !== existing.shortCode) {
    const existingCode = await prisma.strain.findUnique({
      where: { shortCode: data.shortCode.toUpperCase() }
    });
    if (existingCode) {
      throw new AppError(ErrorCodes.DUPLICATE, `Strain with code "${data.shortCode}" already exists`);
    }
  }

  // Check for duplicate name if changing
  if (data.name && data.name !== existing.name) {
    const existingName = await prisma.strain.findUnique({
      where: { name: data.name }
    });
    if (existingName) {
      throw new AppError(ErrorCodes.DUPLICATE, `Strain with name "${data.name}" already exists`);
    }
  }

  const updateData: any = {};
  if (data.name) updateData.name = data.name.trim();
  if (data.shortCode) updateData.shortCode = data.shortCode.toUpperCase().trim();
  if (data.aliases !== undefined) updateData.aliases = JSON.stringify(data.aliases);

  const strain = await prisma.strain.update({
    where: { id },
    data: updateData
  });

  await logAction({
    entityType: ActivityEntity.SYSTEM,
    entityId: strain.id,
    action: 'strain_updated',
    userId,
    summary: `Updated strain "${strain.name}"`,
    before: { name: existing.name, shortCode: existing.shortCode },
    after: { name: strain.name, shortCode: strain.shortCode },
    metadata: { strainId: strain.id },
    tags: ['strain', 'updated']
  });

  return {
    ...strain,
    aliases: parseAliases(strain.aliases)
  };
}

// ========================================
// ARCHIVE STRAIN
// ========================================

/**
 * Archive a strain (soft delete)
 * Prevents archiving if active products reference it (unless forced)
 */
export async function archiveStrain(id: string, userId?: string, force = false) {
  const existing = await prisma.strain.findUnique({
    where: { id },
    include: {
      _count: {
        select: { products: { where: { active: true } } }
      }
    }
  });

  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Strain not found');
  }

  if (existing._count.products > 0 && !force) {
    throw new AppError(
      ErrorCodes.INVALID_OPERATION,
      `Cannot archive strain "${existing.name}" - ${existing._count.products} active product(s) reference it. Use force=true to override.`
    );
  }

  const strain = await prisma.strain.update({
    where: { id },
    data: { active: false }
  });

  await logAction({
    entityType: ActivityEntity.SYSTEM,
    entityId: strain.id,
    action: 'strain_archived',
    userId,
    summary: `Archived strain "${strain.name}"${force ? ' (forced)' : ''}`,
    metadata: { strainId: strain.id, force },
    tags: ['strain', 'archived']
  });

  return strain;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Parse aliases from JSON storage
 */
function parseAliases(aliases: any): string[] {
  if (!aliases) return [];
  if (Array.isArray(aliases)) return aliases;
  if (typeof aliases === 'string') {
    try {
      const parsed = JSON.parse(aliases);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Check if a strain is in use by any active products
 */
export async function isStrainInUse(id: string): Promise<boolean> {
  const count = await prisma.product.count({
    where: { strainId: id, active: true }
  });
  return count > 0;
}

/**
 * Get all strains with their products count
 */
export async function getStrainsWithProductCount() {
  return prisma.strain.findMany({
    where: { active: true },
    include: {
      _count: {
        select: { products: { where: { active: true } } }
      }
    },
    orderBy: { name: 'asc' }
  });
}


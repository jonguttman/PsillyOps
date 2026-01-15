/**
 * Location Service - Hierarchy Validation and Management
 * 
 * HIERARCHY RULES (STRICT):
 * - RACK: Top-level only, may have SHELF children
 * - SHELF: Parent MUST be RACK, may have BIN children
 * - BIN: Parent MUST be SHELF, no children allowed
 * - COLD_STORAGE, PRODUCTION, SHIPPING_RECEIVING: Top-level only, no children
 * 
 * CORE PRINCIPLES:
 * - Hierarchy is STRUCTURAL, not behavioral
 * - Inventory always belongs to exactly ONE concrete Location
 * - Hierarchy never causes implicit inventory movement
 * - All rules enforced in SERVICE layer
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { ActivityEntity } from '@prisma/client';

// Location types
export const LOCATION_TYPES = [
  { value: 'RACK', label: 'Rack' },
  { value: 'SHELF', label: 'Shelf' },
  { value: 'BIN', label: 'Bin' },
  { value: 'COLD_STORAGE', label: 'Cold Storage' },
  { value: 'PRODUCTION', label: 'Production Area' },
  { value: 'SHIPPING_RECEIVING', label: 'Shipping/Receiving' },
] as const;

export type LocationType = typeof LOCATION_TYPES[number]['value'];

// Types that must be top-level (no parent)
const TOP_LEVEL_ONLY_TYPES: LocationType[] = ['RACK', 'COLD_STORAGE', 'PRODUCTION', 'SHIPPING_RECEIVING'];

// Types that cannot have children
const NO_CHILDREN_TYPES: LocationType[] = ['BIN', 'COLD_STORAGE', 'PRODUCTION', 'SHIPPING_RECEIVING'];

// Valid parent type for each child type
const REQUIRED_PARENT_TYPE: Partial<Record<LocationType, LocationType>> = {
  SHELF: 'RACK',
  BIN: 'SHELF',
};

// ========================================
// HIERARCHY VALIDATION
// ========================================

export interface HierarchyValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate that a location type and parent combination is valid.
 * Does NOT check database - pure rule validation.
 */
export function validateHierarchyRules(
  type: string,
  parentType: string | null
): HierarchyValidationResult {
  const locationType = type as LocationType;

  // Check if type must be top-level
  if (TOP_LEVEL_ONLY_TYPES.includes(locationType)) {
    if (parentType !== null) {
      return {
        valid: false,
        error: `${type} must be a top-level location and cannot have a parent.`,
      };
    }
    return { valid: true };
  }

  // Check if type requires a specific parent type
  const requiredParent = REQUIRED_PARENT_TYPE[locationType];
  if (requiredParent) {
    if (parentType === null) {
      return {
        valid: false,
        error: `${type} requires a parent of type ${requiredParent}.`,
      };
    }
    if (parentType !== requiredParent) {
      return {
        valid: false,
        error: `${type} must have a parent of type ${requiredParent}, not ${parentType}.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate that a parent location can accept children.
 */
export function validateParentCanHaveChildren(parentType: string): HierarchyValidationResult {
  if (NO_CHILDREN_TYPES.includes(parentType as LocationType)) {
    return {
      valid: false,
      error: `${parentType} cannot have child locations.`,
    };
  }
  return { valid: true };
}

/**
 * Get valid parent types for a given location type.
 * Returns null if the type must be top-level.
 */
export function getValidParentTypes(type: string): LocationType[] | null {
  const locationType = type as LocationType;

  if (TOP_LEVEL_ONLY_TYPES.includes(locationType)) {
    return null; // Must be top-level
  }

  const requiredParent = REQUIRED_PARENT_TYPE[locationType];
  if (requiredParent) {
    return [requiredParent];
  }

  return null;
}

// ========================================
// SERVICE FUNCTIONS
// ========================================

export interface CreateLocationInput {
  name: string;
  type: string;
  parentId?: string | null;
  isDefaultReceiving?: boolean;
  isDefaultShipping?: boolean;
}

export interface UpdateLocationInput {
  name?: string;
  type?: string;
  parentId?: string | null;
  isDefaultReceiving?: boolean;
  isDefaultShipping?: boolean;
  active?: boolean;
}

/**
 * Create a new location with hierarchy validation.
 */
export async function createLocation(
  input: CreateLocationInput,
  userId: string
): Promise<{ id: string; name: string; type: string; parentId: string | null }> {
  const { name, type, parentId, isDefaultReceiving, isDefaultShipping } = input;

  // Validate type
  const validTypes = LOCATION_TYPES.map((t) => t.value);
  if (!validTypes.includes(type as LocationType)) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `Invalid location type. Must be one of: ${validTypes.join(', ')}`
    );
  }

  // Validate name
  if (!name || !name.trim()) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Location name is required');
  }

  // Check for duplicate name
  const existing = await prisma.location.findUnique({
    where: { name: name.trim() },
  });
  if (existing) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'A location with this name already exists');
  }

  // Validate hierarchy
  let parentType: string | null = null;
  if (parentId) {
    const parent = await prisma.location.findUnique({
      where: { id: parentId },
      select: { id: true, type: true, active: true, name: true },
    });

    if (!parent) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Parent location not found');
    }

    if (!parent.active) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Cannot assign inactive location "${parent.name}" as parent`
      );
    }

    // Check parent can have children
    const parentCheck = validateParentCanHaveChildren(parent.type);
    if (!parentCheck.valid) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, parentCheck.error!);
    }

    parentType = parent.type;
  }

  // Validate type/parent combination
  const hierarchyCheck = validateHierarchyRules(type, parentType);
  if (!hierarchyCheck.valid) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, hierarchyCheck.error!);
  }

  // Handle default flags (only one can be true)
  if (isDefaultReceiving) {
    await prisma.location.updateMany({
      where: { isDefaultReceiving: true },
      data: { isDefaultReceiving: false },
    });
  }
  if (isDefaultShipping) {
    await prisma.location.updateMany({
      where: { isDefaultShipping: true },
      data: { isDefaultShipping: false },
    });
  }

  // Create location
  const location = await prisma.location.create({
    data: {
      name: name.trim(),
      type,
      parentId: parentId || null,
      isDefaultReceiving: isDefaultReceiving || false,
      isDefaultShipping: isDefaultShipping || false,
      active: true,
    },
  });

  // Log creation
  await logAction({
    entityType: ActivityEntity.LOCATION,
    entityId: location.id,
    action: 'location_created',
    userId,
    summary: `Location "${location.name}" created${parentId ? ' with parent' : ''}`,
    after: {
      name: location.name,
      type: location.type,
      parentId: location.parentId,
      isDefaultReceiving: location.isDefaultReceiving,
      isDefaultShipping: location.isDefaultShipping,
    },
    tags: ['location', 'created', ...(parentId ? ['hierarchy'] : [])],
  });

  // Log parent assignment if applicable
  if (parentId) {
    const parent = await prisma.location.findUnique({
      where: { id: parentId },
      select: { name: true },
    });
    await logAction({
      entityType: ActivityEntity.LOCATION,
      entityId: location.id,
      action: 'location_parent_assigned',
      userId,
      summary: `Location "${location.name}" assigned to parent "${parent?.name}"`,
      after: { parentId },
      tags: ['location', 'hierarchy', 'parent_assigned'],
    });
  }

  return {
    id: location.id,
    name: location.name,
    type: location.type,
    parentId: location.parentId,
  };
}

/**
 * Update a location with hierarchy validation.
 */
export async function updateLocation(
  id: string,
  input: UpdateLocationInput,
  userId: string,
  isAdmin: boolean = false
): Promise<{ id: string; name: string; type: string; parentId: string | null }> {
  const { name, type, parentId, isDefaultReceiving, isDefaultShipping, active } = input;

  // Fetch existing location
  const existing = await prisma.location.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true, type: true } },
      children: { where: { active: true }, select: { id: true, name: true } },
      _count: { select: { inventory: true } },
    },
  });

  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Location not found');
  }

  // Determine final values
  const finalType = type ?? existing.type;
  const finalParentId = parentId === undefined ? existing.parentId : parentId;
  const parentChanging = parentId !== undefined && parentId !== existing.parentId;

  // If parent is changing, validate the change
  if (parentChanging) {
    // Check if location has inventory
    if (existing._count.inventory > 0 && !isAdmin) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Cannot change parent of location "${existing.name}" because it has ${existing._count.inventory} inventory items. Admin confirmation required.`
      );
    }

    // Validate new parent
    let newParentType: string | null = null;
    if (finalParentId) {
      const newParent = await prisma.location.findUnique({
        where: { id: finalParentId },
        select: { id: true, type: true, active: true, name: true },
      });

      if (!newParent) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'New parent location not found');
      }

      if (!newParent.active) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          `Cannot assign inactive location "${newParent.name}" as parent`
        );
      }

      const parentCheck = validateParentCanHaveChildren(newParent.type);
      if (!parentCheck.valid) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, parentCheck.error!);
      }

      newParentType = newParent.type;
    }

    // Validate hierarchy rules
    const hierarchyCheck = validateHierarchyRules(finalType, newParentType);
    if (!hierarchyCheck.valid) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, hierarchyCheck.error!);
    }
  }

  // Validate name uniqueness if changing
  if (name !== undefined && name.trim() !== existing.name) {
    const duplicate = await prisma.location.findFirst({
      where: { name: name.trim(), id: { not: id } },
    });
    if (duplicate) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'A location with this name already exists');
    }
  }

  // Validate type if changing
  if (type !== undefined && type !== existing.type) {
    const validTypes = LOCATION_TYPES.map((t) => t.value);
    if (!validTypes.includes(type as LocationType)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Invalid location type. Must be one of: ${validTypes.join(', ')}`
      );
    }

    // Re-validate hierarchy with new type
    let currentParentType: string | null = null;
    if (finalParentId) {
      const parent = await prisma.location.findUnique({
        where: { id: finalParentId },
        select: { type: true },
      });
      currentParentType = parent?.type || null;
    }

    const hierarchyCheck = validateHierarchyRules(type, currentParentType);
    if (!hierarchyCheck.valid) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, hierarchyCheck.error!);
    }

    // Check if new type can have existing children
    if (existing.children.length > 0 && NO_CHILDREN_TYPES.includes(type as LocationType)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Cannot change type to ${type} because this location has ${existing.children.length} child locations.`
      );
    }
  }

  // Handle default flags
  if (isDefaultReceiving === true) {
    await prisma.location.updateMany({
      where: { isDefaultReceiving: true, id: { not: id } },
      data: { isDefaultReceiving: false },
    });
  }
  if (isDefaultShipping === true) {
    await prisma.location.updateMany({
      where: { isDefaultShipping: true, id: { not: id } },
      data: { isDefaultShipping: false },
    });
  }

  // Update location
  const location = await prisma.location.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(type !== undefined && { type }),
      ...(parentId !== undefined && { parentId: parentId || null }),
      ...(isDefaultReceiving !== undefined && { isDefaultReceiving }),
      ...(isDefaultShipping !== undefined && { isDefaultShipping }),
      ...(active !== undefined && { active }),
    },
  });

  // Build diff for logging
  const beforeState: Record<string, any> = {};
  const afterState: Record<string, any> = {};

  if (name !== undefined && name.trim() !== existing.name) {
    beforeState.name = existing.name;
    afterState.name = name.trim();
  }
  if (type !== undefined && type !== existing.type) {
    beforeState.type = existing.type;
    afterState.type = type;
  }
  if (parentChanging) {
    beforeState.parentId = existing.parentId;
    afterState.parentId = finalParentId;
  }
  if (isDefaultReceiving !== undefined && isDefaultReceiving !== existing.isDefaultReceiving) {
    beforeState.isDefaultReceiving = existing.isDefaultReceiving;
    afterState.isDefaultReceiving = isDefaultReceiving;
  }
  if (isDefaultShipping !== undefined && isDefaultShipping !== existing.isDefaultShipping) {
    beforeState.isDefaultShipping = existing.isDefaultShipping;
    afterState.isDefaultShipping = isDefaultShipping;
  }
  if (active !== undefined && active !== existing.active) {
    beforeState.active = existing.active;
    afterState.active = active;
  }

  // Log update if something changed
  if (Object.keys(afterState).length > 0) {
    await logAction({
      entityType: ActivityEntity.LOCATION,
      entityId: location.id,
      action: 'location_updated',
      userId,
      summary: `Location "${location.name}" updated`,
      before: beforeState,
      after: afterState,
      tags: ['location', 'updated', ...(parentChanging ? ['hierarchy'] : [])],
    });
  }

  // Log parent change specifically
  if (parentChanging) {
    const oldParentName = existing.parent?.name || 'none';
    let newParentName = 'none';
    if (finalParentId) {
      const newParent = await prisma.location.findUnique({
        where: { id: finalParentId },
        select: { name: true },
      });
      newParentName = newParent?.name || 'unknown';
    }

    await logAction({
      entityType: ActivityEntity.LOCATION,
      entityId: location.id,
      action: 'location_parent_changed',
      userId,
      summary: `Location "${location.name}" parent changed from "${oldParentName}" to "${newParentName}"`,
      before: { parentId: existing.parentId, parentName: oldParentName },
      after: { parentId: finalParentId, parentName: newParentName },
      tags: ['location', 'hierarchy', 'parent_changed'],
    });
  }

  return {
    id: location.id,
    name: location.name,
    type: location.type,
    parentId: location.parentId,
  };
}

/**
 * Deactivate a location with safety checks.
 */
export async function deactivateLocation(
  id: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const existing = await prisma.location.findUnique({
    where: { id },
    include: {
      children: { where: { active: true }, select: { id: true, name: true } },
      _count: { select: { inventory: true } },
    },
  });

  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Location not found');
  }

  // Check for active children
  if (existing.children.length > 0) {
    const childNames = existing.children.map((c) => c.name).join(', ');
    
    // Log blocked attempt
    await logAction({
      entityType: ActivityEntity.LOCATION,
      entityId: id,
      action: 'location_deactivation_blocked',
      userId,
      summary: `Deactivation of "${existing.name}" blocked: has active children`,
      metadata: {
        reason: 'active_children',
        childCount: existing.children.length,
        childNames,
      },
      tags: ['location', 'hierarchy', 'deactivation_blocked'],
    });

    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `Cannot deactivate location "${existing.name}" because it has ${existing.children.length} active child location(s): ${childNames}. Deactivate children first.`
    );
  }

  // Deactivate
  await prisma.location.update({
    where: { id },
    data: {
      active: false,
      isDefaultReceiving: false,
      isDefaultShipping: false,
    },
  });

  // Log deactivation
  await logAction({
    entityType: ActivityEntity.LOCATION,
    entityId: id,
    action: 'location_deactivated',
    userId,
    summary: `Location "${existing.name}" deactivated`,
    before: {
      active: true,
      isDefaultReceiving: existing.isDefaultReceiving,
      isDefaultShipping: existing.isDefaultShipping,
    },
    after: {
      active: false,
      isDefaultReceiving: false,
      isDefaultShipping: false,
    },
    metadata: {
      inventoryItemsAffected: existing._count.inventory,
    },
    tags: ['location', 'deactivated'],
  });

  if (existing._count.inventory > 0) {
    return {
      success: true,
      message: `Location deactivated. ${existing._count.inventory} inventory items remain at this location.`,
    };
  }

  return { success: true, message: 'Location deactivated.' };
}

/**
 * Get the full path/breadcrumb for a location.
 */
export async function getLocationPath(locationId: string): Promise<string> {
  const parts: string[] = [];
  let currentId: string | null = locationId;

  // Walk up the tree (max 3 levels: BIN → SHELF → RACK)
  for (let i = 0; i < 4 && currentId; i++) {
    const result: { name: string; parentId: string | null } | null =
      await prisma.location.findUnique({
        where: { id: currentId },
        select: { name: true, parentId: true },
      });

    if (!result) break;

    parts.unshift(result.name);
    currentId = result.parentId;
  }

  return parts.join(' → ');
}

/**
 * Get potential parent locations for a given type.
 */
export async function getPotentialParents(type: string): Promise<
  Array<{ id: string; name: string; type: string; path: string }>
> {
  const validParentTypes = getValidParentTypes(type);

  if (!validParentTypes) {
    return []; // Type must be top-level
  }

  const parents = await prisma.location.findMany({
    where: {
      type: { in: validParentTypes },
      active: true,
    },
    select: { id: true, name: true, type: true, parentId: true },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  // Build paths for each parent
  const result = await Promise.all(
    parents.map(async (p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      path: await getLocationPath(p.id),
    }))
  );

  return result;
}


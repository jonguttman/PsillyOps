// Role-Based Access Control (RBAC) Utilities

import { UserRole } from '@prisma/client';

// Permission definitions for each resource and action
export const PERMISSIONS = {
  products: {
    create: [UserRole.ADMIN],
    update: [UserRole.ADMIN],
    delete: [UserRole.ADMIN],
    view: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE, UserRole.REP]
  },
  materials: {
    create: [UserRole.ADMIN],
    update: [UserRole.ADMIN],
    delete: [UserRole.ADMIN],
    view: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },
  vendors: {
    create: [UserRole.ADMIN],
    update: [UserRole.ADMIN],
    delete: [UserRole.ADMIN],
    view: [UserRole.ADMIN, UserRole.WAREHOUSE]
  },
  locations: {
    create: [UserRole.ADMIN],
    update: [UserRole.ADMIN],
    delete: [UserRole.ADMIN],
    view: [UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.PRODUCTION]
  },
  inventory: {
    adjust: [UserRole.ADMIN, UserRole.WAREHOUSE],
    move: [UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.PRODUCTION],
    reserve: [UserRole.ADMIN, UserRole.WAREHOUSE],
    release: [UserRole.ADMIN, UserRole.WAREHOUSE],
    view: [UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.PRODUCTION]
  },
  orders: {
    create: [UserRole.ADMIN, UserRole.REP],
    update: [UserRole.ADMIN, UserRole.REP],
    approve: [UserRole.ADMIN],
    ship: [UserRole.ADMIN, UserRole.WAREHOUSE],
    cancel: [UserRole.ADMIN],
    view: [UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.REP]
  },
  production: {
    create: [UserRole.ADMIN, UserRole.PRODUCTION],
    update: [UserRole.ADMIN, UserRole.PRODUCTION],
    start: [UserRole.ADMIN, UserRole.PRODUCTION],
    complete: [UserRole.ADMIN, UserRole.PRODUCTION],
    block: [UserRole.ADMIN, UserRole.PRODUCTION],
    cancel: [UserRole.ADMIN],
    issueMaterials: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE],
    view: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },
  batches: {
    create: [UserRole.ADMIN, UserRole.PRODUCTION],
    update: [UserRole.ADMIN, UserRole.PRODUCTION],
    complete: [UserRole.ADMIN, UserRole.PRODUCTION],
    qc: [UserRole.ADMIN, UserRole.PRODUCTION],
    labor: [UserRole.ADMIN, UserRole.PRODUCTION],
    view: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },
  workCenters: {
    create: [UserRole.ADMIN],
    update: [UserRole.ADMIN],
    delete: [UserRole.ADMIN],
    view: [UserRole.ADMIN, UserRole.PRODUCTION]
  },
  templates: {
    create: [UserRole.ADMIN],
    update: [UserRole.ADMIN],
    delete: [UserRole.ADMIN],
    view: [UserRole.ADMIN, UserRole.PRODUCTION]
  },
  purchasing: {
    create: [UserRole.ADMIN],
    update: [UserRole.ADMIN],
    send: [UserRole.ADMIN],
    receive: [UserRole.ADMIN, UserRole.WAREHOUSE],
    cancel: [UserRole.ADMIN],
    view: [UserRole.ADMIN, UserRole.WAREHOUSE]
  },
  analytics: {
    view: [UserRole.ADMIN]
  },
  users: {
    create: [UserRole.ADMIN],
    update: [UserRole.ADMIN],
    delete: [UserRole.ADMIN],
    view: [UserRole.ADMIN]
  }
} as const;

/**
 * Check if a user role has permission for a specific resource and action
 */
export function hasPermission(
  userRole: UserRole,
  resource: keyof typeof PERMISSIONS,
  action: string
): boolean {
  const resourcePermissions = PERMISSIONS[resource];
  if (!resourcePermissions) return false;
  
  const allowedRoles = (resourcePermissions as any)[action];
  if (!allowedRoles) return false;
  
  return allowedRoles.includes(userRole);
}

/**
 * Check if user can access a specific resource
 * (has at least one permission on that resource)
 */
export function canAccessResource(
  userRole: UserRole,
  resource: keyof typeof PERMISSIONS
): boolean {
  const resourcePermissions = PERMISSIONS[resource];
  if (!resourcePermissions) return false;
  
  return Object.values(resourcePermissions).some(
    (roles: UserRole[]) => roles.includes(userRole)
  );
}

/**
 * Get all resources a user can access
 */
export function getAccessibleResources(userRole: UserRole): string[] {
  return Object.keys(PERMISSIONS).filter(resource =>
    canAccessResource(userRole, resource as keyof typeof PERMISSIONS)
  );
}

/**
 * Check if user is admin
 */
export function isAdmin(userRole: UserRole): boolean {
  return userRole === UserRole.ADMIN;
}

/**
 * Check if user can manage orders (create/update)
 */
export function canManageOrders(userRole: UserRole): boolean {
  return [UserRole.ADMIN, UserRole.REP].includes(userRole);
}

/**
 * Check if user can manage production
 */
export function canManageProduction(userRole: UserRole): boolean {
  return [UserRole.ADMIN, UserRole.PRODUCTION].includes(userRole);
}

/**
 * Check if user can manage warehouse operations
 */
export function canManageWarehouse(userRole: UserRole): boolean {
  return [UserRole.ADMIN, UserRole.WAREHOUSE].includes(userRole);
}


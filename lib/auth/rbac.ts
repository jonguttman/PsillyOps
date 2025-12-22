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
  insights: {
    view: [UserRole.ADMIN, UserRole.ANALYST],
    export: [UserRole.ADMIN, UserRole.ANALYST]
  },
  users: {
    create: [UserRole.ADMIN],
    update: [UserRole.ADMIN],
    delete: [UserRole.ADMIN],
    view: [UserRole.ADMIN]
  },
  ai: {
    command: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE],
    ingest: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE],
    view: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE, UserRole.REP]
  },
  partner: {
    view_own: [UserRole.PARTNER_ADMIN, UserRole.PARTNER_OPERATOR],
    manage_products: [UserRole.PARTNER_ADMIN],
    bind_seals: [UserRole.PARTNER_ADMIN, UserRole.PARTNER_OPERATOR],
    manage_users: [UserRole.PARTNER_ADMIN]
  },
  sealSheets: {
    assign: [UserRole.ADMIN],
    revoke: [UserRole.ADMIN],
    view: [UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.PARTNER_ADMIN]
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
  return ([UserRole.ADMIN, UserRole.REP] as UserRole[]).includes(userRole);
}

/**
 * Check if user can manage production
 */
export function canManageProduction(userRole: UserRole): boolean {
  return ([UserRole.ADMIN, UserRole.PRODUCTION] as UserRole[]).includes(userRole);
}

/**
 * Check if user can manage warehouse operations
 */
export function canManageWarehouse(userRole: UserRole): boolean {
  return ([UserRole.ADMIN, UserRole.WAREHOUSE] as UserRole[]).includes(userRole);
}

/**
 * Check if user can use AI command features
 */
export function canUseAICommand(userRole: UserRole): boolean {
  return ([UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE] as UserRole[]).includes(userRole);
}

/**
 * Check if user can use AI ingest features
 */
export function canUseAIIngest(userRole: UserRole): boolean {
  return ([UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE] as UserRole[]).includes(userRole);
}

/**
 * Check if user is a partner user (PARTNER_ADMIN or PARTNER_OPERATOR)
 */
export function isPartnerUser(userRole: UserRole): boolean {
  return ([UserRole.PARTNER_ADMIN, UserRole.PARTNER_OPERATOR] as UserRole[]).includes(userRole);
}

/**
 * Check if user can manage partner resources (must be partner user)
 */
export function canManagePartnerResources(userRole: UserRole): boolean {
  return isPartnerUser(userRole);
}

/**
 * Check if user can bind seals to products
 */
export function canBindSeals(userRole: UserRole): boolean {
  return hasPermission(userRole, 'partner', 'bind_seals');
}

/**
 * Check if user can assign seal sheets (ADMIN only)
 */
export function canAssignSealSheets(userRole: UserRole): boolean {
  return hasPermission(userRole, 'sealSheets', 'assign');
}


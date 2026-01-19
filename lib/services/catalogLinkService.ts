// CATALOG LINK SERVICE - Shareable product catalog with unique tracking links
// Provides frictionless catalog access for retailers with engagement analytics

import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { logAction } from './loggingService';
import { ActivityEntity, CatalogLinkStatus, InquiryStatus, CatalogRequestStatus, CatalogRequestItemType, Prisma } from '@prisma/client';
import { AppError, ErrorCodes } from '@/lib/utils/errors';

// ========================================
// TYPES
// ========================================

export interface CreateCatalogLinkParams {
  retailerId: string;
  createdById: string;
  displayName?: string;
  customPricing?: Record<string, number>;
  productSubset?: string[];
  expiresAt?: Date;
}

export interface UpdateCatalogLinkParams {
  displayName?: string;
  customPricing?: Record<string, number> | null;
  productSubset?: string[] | null;
  expiresAt?: Date | null;
  status?: CatalogLinkStatus;
}

export interface CatalogLinkResolution {
  id: string;
  token: string;
  retailerId: string;
  retailerName: string;
  displayName: string;
  customPricing: Record<string, number> | null;
  productSubset: string[] | null;
  status: CatalogLinkStatus;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  whyChoose: string | null;
  suggestedUse: string | null;
  wholesalePrice: number | null;
  effectivePrice: number | null; // After custom pricing applied
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  availableQuantity: number;
}

export interface CreateInquiryParams {
  catalogLinkId: string;
  contactName: string;
  businessName: string;
  email: string;
  phone?: string;
  followUpWith?: string;
  message?: string;
  productsOfInterest?: string[];
  ipAddress?: string;
  userAgent?: string;
}

export interface CatalogAnalytics {
  totalViews: number;
  uniqueDaysViewed: number;
  totalProductViews: number;
  totalInquiries: number;
  topProducts: { productId: string; productName: string; viewCount: number }[];
  recentActivity: { date: Date; action: string; details: string }[];
}

// Cart/Request types
export interface CartItem {
  productId: string;
  itemType: 'QUOTE' | 'SAMPLE';
  quantity: number;
  sampleReason?: string; // Required for SAMPLE type
}

export interface SubmitCatalogRequestParams {
  catalogLinkId: string;
  items: CartItem[];
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  message?: string;
}

export interface CatalogRequestWithItems {
  id: string;
  catalogLinkId: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  message: string | null;
  status: CatalogRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  catalogLink: {
    token: string;
    displayName: string | null;
    retailer: {
      id: string;
      name: string;
      salesRepId: string | null;
    };
  };
  assignedTo: {
    id: string;
    name: string;
  } | null;
  items: {
    id: string;
    productId: string;
    itemType: CatalogRequestItemType;
    quantity: number;
    sampleReason: string | null;
    product: {
      id: string;
      name: string;
      sku: string;
      publicImageUrl: string | null;
    };
  }[];
}

// ========================================
// TOKEN GENERATION
// ========================================

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const TOKEN_LENGTH = 6; // Short, shareable tokens

/**
 * Generate a cryptographically random catalog token
 * Format: 6-char base62 string (e.g., "Xk9mP2")
 */
export function generateCatalogToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH);
  let token = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += BASE62[bytes[i] % 62];
  }
  return token;
}

/**
 * Validate token format
 */
export function isValidTokenFormat(token: string): boolean {
  if (token.length !== TOKEN_LENGTH) return false;
  return /^[0-9A-Za-z]+$/.test(token);
}

// ========================================
// CRUD OPERATIONS
// ========================================

/**
 * Create a new catalog link for a retailer
 */
export async function createCatalogLink(params: CreateCatalogLinkParams) {
  const { retailerId, createdById, displayName, customPricing, productSubset, expiresAt } = params;

  // Verify retailer exists
  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: { id: true, name: true, active: true }
  });

  if (!retailer) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Retailer not found');
  }

  if (!retailer.active) {
    throw new AppError(ErrorCodes.INVALID_OPERATION, 'Cannot create catalog link for inactive retailer');
  }

  // Validate product subset if provided
  if (productSubset && productSubset.length > 0) {
    const validProducts = await prisma.product.findMany({
      where: { id: { in: productSubset }, active: true },
      select: { id: true }
    });
    const validIds = validProducts.map(p => p.id);
    const invalidIds = productSubset.filter(id => !validIds.includes(id));
    if (invalidIds.length > 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Invalid product IDs: ${invalidIds.join(', ')}`);
    }
  }

  // Generate unique token
  let token = generateCatalogToken();
  let attempts = 0;
  while (await prisma.catalogLink.findUnique({ where: { token } })) {
    token = generateCatalogToken();
    attempts++;
    if (attempts > 10) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to generate unique token');
    }
  }

  const catalogLink = await prisma.catalogLink.create({
    data: {
      token,
      retailerId,
      displayName: displayName || retailer.name,
      customPricing: customPricing || undefined,
      productSubset: productSubset || undefined,
      expiresAt,
      createdById
    },
    include: {
      retailer: { select: { name: true } }
    }
  });

  await logAction({
    entityType: ActivityEntity.CATALOG_LINK,
    entityId: catalogLink.id,
    action: 'catalog_link_created',
    userId: createdById,
    summary: `Created catalog link for ${retailer.name}`,
    metadata: {
      token: catalogLink.token,
      retailerId,
      retailerName: retailer.name,
      hasCustomPricing: !!customPricing,
      hasProductSubset: !!productSubset,
      expiresAt
    },
    tags: ['catalog', 'create']
  });

  return catalogLink;
}

/**
 * Get a catalog link by ID
 */
export async function getCatalogLink(id: string) {
  return prisma.catalogLink.findUnique({
    where: { id },
    include: {
      retailer: { select: { id: true, name: true, contactEmail: true, salesRepId: true } },
      createdBy: { select: { id: true, name: true } },
      _count: {
        select: {
          productViews: true,
          inquiries: true
        }
      }
    }
  });
}

/**
 * Get a catalog link by token
 */
export async function getCatalogLinkByToken(token: string) {
  if (!isValidTokenFormat(token)) {
    return null;
  }
  return prisma.catalogLink.findUnique({
    where: { token },
    include: {
      retailer: { select: { id: true, name: true } }
    }
  });
}

/**
 * Update a catalog link
 */
export async function updateCatalogLink(id: string, params: UpdateCatalogLinkParams, userId?: string) {
  const existing = await prisma.catalogLink.findUnique({
    where: { id },
    include: { retailer: { select: { name: true } } }
  });

  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Catalog link not found');
  }

  // Validate product subset if provided
  if (params.productSubset && params.productSubset.length > 0) {
    const validProducts = await prisma.product.findMany({
      where: { id: { in: params.productSubset }, active: true },
      select: { id: true }
    });
    const validIds = validProducts.map(p => p.id);
    const invalidIds = params.productSubset.filter(id => !validIds.includes(id));
    if (invalidIds.length > 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Invalid product IDs: ${invalidIds.join(', ')}`);
    }
  }

  const updated = await prisma.catalogLink.update({
    where: { id },
    data: {
      displayName: params.displayName,
      customPricing: params.customPricing === null
        ? Prisma.DbNull
        : params.customPricing !== undefined
          ? params.customPricing
          : undefined,
      productSubset: params.productSubset === null
        ? Prisma.DbNull
        : params.productSubset !== undefined
          ? params.productSubset
          : undefined,
      expiresAt: params.expiresAt,
      status: params.status
    },
    include: {
      retailer: { select: { id: true, name: true } }
    }
  });

  await logAction({
    entityType: ActivityEntity.CATALOG_LINK,
    entityId: id,
    action: 'catalog_link_updated',
    userId,
    summary: `Updated catalog link for ${existing.retailer.name}`,
    before: {
      displayName: existing.displayName,
      customPricing: existing.customPricing,
      productSubset: existing.productSubset,
      expiresAt: existing.expiresAt,
      status: existing.status
    },
    after: {
      displayName: updated.displayName,
      customPricing: updated.customPricing,
      productSubset: updated.productSubset,
      expiresAt: updated.expiresAt,
      status: updated.status
    },
    tags: ['catalog', 'update']
  });

  // Create detailed edit records for audit trail (if userId provided)
  if (userId) {
    const edits: { fieldName: string; oldValue: string | null; newValue: string | null }[] = [];

    // Check each field for changes
    if (params.displayName !== undefined && params.displayName !== existing.displayName) {
      edits.push({
        fieldName: 'displayName',
        oldValue: existing.displayName || null,
        newValue: params.displayName || null
      });
    }

    if (params.customPricing !== undefined) {
      const oldVal = JSON.stringify(existing.customPricing);
      const newVal = params.customPricing === null ? null : JSON.stringify(params.customPricing);
      if (oldVal !== newVal) {
        edits.push({
          fieldName: 'customPricing',
          oldValue: oldVal === 'null' ? null : oldVal,
          newValue: newVal
        });
      }
    }

    if (params.productSubset !== undefined) {
      const oldVal = JSON.stringify(existing.productSubset);
      const newVal = params.productSubset === null ? null : JSON.stringify(params.productSubset);
      if (oldVal !== newVal) {
        edits.push({
          fieldName: 'productSubset',
          oldValue: oldVal === 'null' ? null : oldVal,
          newValue: newVal
        });
      }
    }

    if (params.expiresAt !== undefined) {
      const oldVal = existing.expiresAt?.toISOString() || null;
      const newVal = params.expiresAt?.toISOString() || null;
      if (oldVal !== newVal) {
        edits.push({
          fieldName: 'expiresAt',
          oldValue: oldVal,
          newValue: newVal
        });
      }
    }

    if (params.status !== undefined && params.status !== existing.status) {
      edits.push({
        fieldName: 'status',
        oldValue: existing.status,
        newValue: params.status
      });
    }

    // Create edit records
    if (edits.length > 0) {
      await prisma.catalogLinkEdit.createMany({
        data: edits.map(edit => ({
          catalogLinkId: id,
          editedById: userId,
          ...edit
        }))
      });
    }
  }

  return updated;
}

/**
 * Get edit history for a catalog link (admin only)
 */
export async function getCatalogLinkEdits(catalogLinkId: string) {
  return prisma.catalogLinkEdit.findMany({
    where: { catalogLinkId },
    include: {
      editedBy: { select: { id: true, name: true, role: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Revoke a catalog link
 */
export async function revokeCatalogLink(id: string, userId?: string) {
  const existing = await prisma.catalogLink.findUnique({
    where: { id },
    include: { retailer: { select: { name: true } } }
  });

  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Catalog link not found');
  }

  if (existing.status === CatalogLinkStatus.REVOKED) {
    throw new AppError(ErrorCodes.CONFLICT, 'Catalog link is already revoked');
  }

  const updated = await prisma.catalogLink.update({
    where: { id },
    data: { status: CatalogLinkStatus.REVOKED }
  });

  await logAction({
    entityType: ActivityEntity.CATALOG_LINK,
    entityId: id,
    action: 'catalog_link_revoked',
    userId,
    summary: `Revoked catalog link for ${existing.retailer.name}`,
    metadata: {
      token: existing.token,
      retailerId: existing.retailerId,
      viewCount: existing.viewCount
    },
    tags: ['catalog', 'revoke']
  });

  return updated;
}

/**
 * List all catalog links with optional filters
 */
export async function listCatalogLinks(options?: {
  retailerId?: string;
  status?: CatalogLinkStatus;
  createdById?: string;
  limit?: number;
  offset?: number;
}) {
  const where: any = {};
  if (options?.retailerId) where.retailerId = options.retailerId;
  if (options?.status) where.status = options.status;
  if (options?.createdById) where.createdById = options.createdById;

  const [links, total] = await Promise.all([
    prisma.catalogLink.findMany({
      where,
      include: {
        retailer: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: {
          select: {
            productViews: true,
            inquiries: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0
    }),
    prisma.catalogLink.count({ where })
  ]);

  return { links, total };
}

// ========================================
// PUBLIC RESOLUTION & TRACKING
// ========================================

/**
 * Resolve a catalog token and track the view
 * @param token - The catalog token
 * @param metadata - Optional IP and user agent for tracking
 * @param options - Optional settings (skipTracking: true for internal/admin views)
 */
export async function resolveCatalogToken(
  token: string,
  metadata?: { ip?: string; userAgent?: string },
  options?: { skipTracking?: boolean }
): Promise<CatalogLinkResolution | null> {
  if (!isValidTokenFormat(token)) {
    return null;
  }

  const link = await prisma.catalogLink.findUnique({
    where: { token },
    include: {
      retailer: { select: { id: true, name: true } }
    }
  });

  if (!link) {
    return null;
  }

  // Check expiration
  if (link.expiresAt && link.expiresAt < new Date()) {
    if (link.status === CatalogLinkStatus.ACTIVE) {
      await prisma.catalogLink.update({
        where: { id: link.id },
        data: { status: CatalogLinkStatus.EXPIRED }
      });
    }
    return null;
  }

  // Check if revoked
  if (link.status === CatalogLinkStatus.REVOKED || link.status === CatalogLinkStatus.EXPIRED) {
    return null;
  }

  // Track the view (skip for internal/admin views)
  if (!options?.skipTracking) {
    await prisma.catalogLink.update({
      where: { id: link.id },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: new Date()
      }
    });

    // Log the view
    await logAction({
      entityType: ActivityEntity.CATALOG_LINK,
      entityId: link.id,
      action: 'catalog_viewed',
      ipAddress: metadata?.ip,
      userAgent: metadata?.userAgent,
      summary: `Catalog viewed for ${link.retailer.name}`,
      metadata: {
        token: link.token,
        retailerId: link.retailerId,
        retailerName: link.retailer.name,
        viewCount: link.viewCount + 1,
        surface: 'public'
      },
      tags: ['catalog', 'view', 'public']
    });
  }

  return {
    id: link.id,
    token: link.token,
    retailerId: link.retailerId,
    retailerName: link.retailer.name,
    displayName: link.displayName || link.retailer.name,
    customPricing: link.customPricing as Record<string, number> | null,
    productSubset: link.productSubset as string[] | null,
    status: link.status
  };
}

// ========================================
// EXPIRED CATALOG INFO
// ========================================

export interface ExpiredCatalogInfo {
  token: string;
  retailerId: string | null;
  retailerName: string | null;
  isExpired: true;
}

/**
 * Get info for an expired catalog token
 * Returns retailer info if token exists and is EXPIRED (not REVOKED or ACTIVE)
 * Used to show the renewal request page for expired catalogs
 */
export async function getExpiredCatalogInfo(
  token: string
): Promise<ExpiredCatalogInfo | null> {
  if (!isValidTokenFormat(token)) {
    return null;
  }

  const link = await prisma.catalogLink.findUnique({
    where: { token },
    include: {
      retailer: { select: { id: true, name: true } }
    }
  });

  if (!link) {
    return null;
  }

  // Check if expired by date (auto-update status if needed)
  const isExpiredByDate = link.expiresAt && link.expiresAt < new Date();

  if (isExpiredByDate && link.status === CatalogLinkStatus.ACTIVE) {
    // Auto-update status to EXPIRED
    await prisma.catalogLink.update({
      where: { id: link.id },
      data: { status: CatalogLinkStatus.EXPIRED }
    });
  }

  // Only return info for EXPIRED status (not REVOKED - revoked shows 404)
  const isExpired = isExpiredByDate || link.status === CatalogLinkStatus.EXPIRED;
  const isRevoked = link.status === CatalogLinkStatus.REVOKED;

  if (!isExpired || isRevoked) {
    return null;
  }

  return {
    token: link.token,
    retailerId: link.retailerId,
    retailerName: link.retailer.name,
    isExpired: true
  };
}

/**
 * Get catalog products with custom pricing applied
 */
export async function getCatalogProducts(catalogLinkId: string): Promise<CatalogProduct[]> {
  const link = await prisma.catalogLink.findUnique({
    where: { id: catalogLinkId },
    select: {
      customPricing: true,
      productSubset: true
    }
  });

  if (!link) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Catalog link not found');
  }

  const customPricing = link.customPricing as Record<string, number> | null;
  const productSubset = link.productSubset as string[] | null;

  // Build product filter
  const where: any = {
    active: true,
    wholesalePrice: { not: null } // Only show products with wholesale pricing
  };

  if (productSubset && productSubset.length > 0) {
    where.id = { in: productSubset };
  }

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      sku: true,
      publicDescription: true,
      publicImageUrl: true,
      publicWhyChoose: true,
      publicSuggestedUse: true,
      wholesalePrice: true
    },
    orderBy: { name: 'asc' }
  });

  // Get inventory levels for stock status
  const productIds = products.map(p => p.id);
  const inventory = await prisma.inventoryItem.groupBy({
    by: ['productId'],
    where: {
      productId: { in: productIds },
      type: 'PRODUCT',
      status: 'AVAILABLE'
    },
    _sum: {
      quantityOnHand: true,
      quantityReserved: true
    }
  });

  const inventoryMap = new Map(
    inventory.map(i => [
      i.productId,
      {
        available: (i._sum.quantityOnHand || 0) - (i._sum.quantityReserved || 0)
      }
    ])
  );

  return products.map(product => {
    const inv = inventoryMap.get(product.id);
    const availableQuantity = inv?.available || 0;
    const effectivePrice = customPricing?.[product.id] ?? product.wholesalePrice;

    let stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
    if (availableQuantity <= 0) {
      stockStatus = 'OUT_OF_STOCK';
    } else if (availableQuantity < 10) {
      stockStatus = 'LOW_STOCK';
    } else {
      stockStatus = 'IN_STOCK';
    }

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.publicDescription,
      imageUrl: product.publicImageUrl,
      whyChoose: product.publicWhyChoose,
      suggestedUse: product.publicSuggestedUse,
      wholesalePrice: product.wholesalePrice,
      effectivePrice,
      stockStatus,
      availableQuantity
    };
  });
}

/**
 * Get a single product detail for the catalog
 */
export async function getCatalogProduct(
  catalogLinkId: string,
  productId: string
): Promise<CatalogProduct | null> {
  const link = await prisma.catalogLink.findUnique({
    where: { id: catalogLinkId },
    select: {
      customPricing: true,
      productSubset: true
    }
  });

  if (!link) {
    return null;
  }

  const customPricing = link.customPricing as Record<string, number> | null;
  const productSubset = link.productSubset as string[] | null;

  // Check if product is in subset (if subset defined)
  if (productSubset && productSubset.length > 0 && !productSubset.includes(productId)) {
    return null;
  }

  const product = await prisma.product.findUnique({
    where: { id: productId, active: true },
    select: {
      id: true,
      name: true,
      sku: true,
      publicDescription: true,
      publicImageUrl: true,
      publicWhyChoose: true,
      publicSuggestedUse: true,
      wholesalePrice: true
    }
  });

  if (!product || product.wholesalePrice === null) {
    return null;
  }

  // Get inventory
  const inventory = await prisma.inventoryItem.aggregate({
    where: {
      productId,
      type: 'PRODUCT',
      status: 'AVAILABLE'
    },
    _sum: {
      quantityOnHand: true,
      quantityReserved: true
    }
  });

  const availableQuantity = (inventory._sum.quantityOnHand || 0) - (inventory._sum.quantityReserved || 0);
  const effectivePrice = customPricing?.[product.id] ?? product.wholesalePrice;

  let stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  if (availableQuantity <= 0) {
    stockStatus = 'OUT_OF_STOCK';
  } else if (availableQuantity < 10) {
    stockStatus = 'LOW_STOCK';
  } else {
    stockStatus = 'IN_STOCK';
  }

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.publicDescription,
    imageUrl: product.publicImageUrl,
    whyChoose: product.publicWhyChoose,
    suggestedUse: product.publicSuggestedUse,
    wholesalePrice: product.wholesalePrice,
    effectivePrice,
    stockStatus,
    availableQuantity
  };
}

/**
 * Track a product view in the catalog
 * @param catalogLinkId - The catalog link ID
 * @param productId - The product ID
 * @param metadata - Optional IP and user agent
 * @param options - Optional settings (skipTracking: true for internal views)
 */
export async function trackProductView(
  catalogLinkId: string,
  productId: string,
  metadata?: { ip?: string; userAgent?: string },
  options?: { skipTracking?: boolean }
) {
  // Skip tracking for internal views
  if (options?.skipTracking) {
    return null;
  }

  const link = await prisma.catalogLink.findUnique({
    where: { id: catalogLinkId },
    include: { retailer: { select: { name: true } } }
  });

  if (!link) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Catalog link not found');
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true }
  });

  if (!product) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
  }

  // Upsert product view
  const view = await prisma.catalogProductView.upsert({
    where: {
      catalogLinkId_productId: { catalogLinkId, productId }
    },
    create: {
      catalogLinkId,
      productId,
      viewCount: 1,
      lastViewedAt: new Date()
    },
    update: {
      viewCount: { increment: 1 },
      lastViewedAt: new Date()
    }
  });

  // Log the view
  await logAction({
    entityType: ActivityEntity.CATALOG_LINK,
    entityId: catalogLinkId,
    action: 'catalog_product_viewed',
    ipAddress: metadata?.ip,
    userAgent: metadata?.userAgent,
    summary: `Product "${product.name}" viewed in catalog for ${link.retailer.name}`,
    metadata: {
      token: link.token,
      retailerId: link.retailerId,
      retailerName: link.retailer.name,
      productId,
      productName: product.name,
      productViewCount: view.viewCount,
      surface: 'public'
    },
    tags: ['catalog', 'product', 'view', 'public']
  });

  return view;
}

// ========================================
// INQUIRY OPERATIONS
// ========================================

/**
 * Create a new inquiry from the contact form
 */
export async function createInquiry(params: CreateInquiryParams) {
  const {
    catalogLinkId,
    contactName,
    businessName,
    email,
    phone,
    followUpWith,
    message,
    productsOfInterest,
    ipAddress,
    userAgent
  } = params;

  const link = await prisma.catalogLink.findUnique({
    where: { id: catalogLinkId },
    include: { retailer: { select: { name: true, salesRepId: true } } }
  });

  if (!link) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Catalog link not found');
  }

  const inquiry = await prisma.catalogInquiry.create({
    data: {
      catalogLinkId,
      contactName,
      businessName,
      email,
      phone,
      followUpWith,
      message,
      productsOfInterest: productsOfInterest || undefined,
      ipAddress,
      userAgent,
      status: InquiryStatus.NEW
    }
  });

  // Log the inquiry
  await logAction({
    entityType: ActivityEntity.CATALOG_LINK,
    entityId: catalogLinkId,
    action: 'catalog_inquiry_submitted',
    ipAddress,
    userAgent,
    summary: `New inquiry from ${contactName} (${businessName}) via catalog for ${link.retailer.name}`,
    metadata: {
      token: link.token,
      retailerId: link.retailerId,
      retailerName: link.retailer.name,
      inquiryId: inquiry.id,
      contactName,
      businessName,
      email,
      productsOfInterest
    },
    tags: ['catalog', 'inquiry', 'public']
  });

  return inquiry;
}

/**
 * Update inquiry status
 */
export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus,
  userId?: string,
  notes?: string
) {
  const existing = await prisma.catalogInquiry.findUnique({
    where: { id },
    include: {
      catalogLink: {
        include: { retailer: { select: { name: true } } }
      }
    }
  });

  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Inquiry not found');
  }

  const updated = await prisma.catalogInquiry.update({
    where: { id },
    data: {
      status,
      notes: notes || existing.notes,
      respondedAt: status !== InquiryStatus.NEW ? new Date() : undefined,
      respondedById: userId
    }
  });

  await logAction({
    entityType: ActivityEntity.CATALOG_LINK,
    entityId: existing.catalogLinkId,
    action: 'catalog_inquiry_updated',
    userId,
    summary: `Inquiry from ${existing.contactName} marked as ${status}`,
    before: { status: existing.status },
    after: { status },
    metadata: {
      inquiryId: id,
      contactName: existing.contactName,
      businessName: existing.businessName
    },
    tags: ['catalog', 'inquiry', 'update']
  });

  return updated;
}

/**
 * List all inquiries with optional filters
 */
export async function listInquiries(options?: {
  catalogLinkId?: string;
  status?: InquiryStatus;
  limit?: number;
  offset?: number;
}) {
  const where: any = {};
  if (options?.catalogLinkId) where.catalogLinkId = options.catalogLinkId;
  if (options?.status) where.status = options.status;

  const [inquiries, total] = await Promise.all([
    prisma.catalogInquiry.findMany({
      where,
      include: {
        catalogLink: {
          include: {
            retailer: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0
    }),
    prisma.catalogInquiry.count({ where })
  ]);

  return { inquiries, total };
}

// ========================================
// ANALYTICS
// ========================================

/**
 * Get detailed analytics for a catalog link
 */
export async function getCatalogLinkAnalytics(id: string): Promise<CatalogAnalytics> {
  const link = await prisma.catalogLink.findUnique({
    where: { id },
    select: { viewCount: true, createdAt: true }
  });

  if (!link) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Catalog link not found');
  }

  // Get product views
  const productViews = await prisma.catalogProductView.findMany({
    where: { catalogLinkId: id },
    include: {
      product: { select: { name: true } }
    },
    orderBy: { viewCount: 'desc' },
    take: 10
  });

  // Get inquiry count
  const inquiryCount = await prisma.catalogInquiry.count({
    where: { catalogLinkId: id }
  });

  // Get unique days viewed from activity logs
  const viewLogs = await prisma.activityLog.findMany({
    where: {
      entityType: ActivityEntity.CATALOG_LINK,
      entityId: id,
      action: 'catalog_viewed'
    },
    select: { createdAt: true }
  });

  const uniqueDays = new Set(
    viewLogs.map(log => log.createdAt.toISOString().split('T')[0])
  );

  // Get recent activity
  const recentLogs = await prisma.activityLog.findMany({
    where: {
      entityType: ActivityEntity.CATALOG_LINK,
      entityId: id
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  return {
    totalViews: link.viewCount,
    uniqueDaysViewed: uniqueDays.size,
    totalProductViews: productViews.reduce((sum, pv) => sum + pv.viewCount, 0),
    totalInquiries: inquiryCount,
    topProducts: productViews.map(pv => ({
      productId: pv.productId,
      productName: pv.product.name,
      viewCount: pv.viewCount
    })),
    recentActivity: recentLogs.map(log => ({
      date: log.createdAt,
      action: log.action,
      details: log.summary
    }))
  };
}

/**
 * Get aggregate analytics across all catalog links
 */
export async function getAggregateAnalytics() {
  // Most viewed products across all catalogs
  const topProducts = await prisma.catalogProductView.groupBy({
    by: ['productId'],
    _sum: { viewCount: true },
    orderBy: { _sum: { viewCount: 'desc' } },
    take: 10
  });

  const productNames = await prisma.product.findMany({
    where: { id: { in: topProducts.map(p => p.productId) } },
    select: { id: true, name: true }
  });

  const productNameMap = new Map(productNames.map(p => [p.id, p.name]));

  // Most engaged retailers
  const topRetailers = await prisma.catalogLink.findMany({
    orderBy: { viewCount: 'desc' },
    take: 10,
    include: {
      retailer: { select: { id: true, name: true } }
    }
  });

  // Recent inquiries
  const recentInquiries = await prisma.catalogInquiry.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      catalogLink: {
        include: { retailer: { select: { name: true } } }
      }
    }
  });

  // Total stats
  const [totalLinks, totalViews, totalInquiries] = await Promise.all([
    prisma.catalogLink.count({ where: { status: CatalogLinkStatus.ACTIVE } }),
    prisma.catalogLink.aggregate({ _sum: { viewCount: true } }),
    prisma.catalogInquiry.count()
  ]);

  return {
    summary: {
      totalActiveLinks: totalLinks,
      totalViews: totalViews._sum.viewCount || 0,
      totalInquiries
    },
    topProducts: topProducts.map(p => ({
      productId: p.productId,
      productName: productNameMap.get(p.productId) || 'Unknown',
      viewCount: p._sum.viewCount || 0
    })),
    topRetailers: topRetailers.map(link => ({
      retailerId: link.retailerId,
      retailerName: link.retailer.name,
      viewCount: link.viewCount
    })),
    recentInquiries: recentInquiries.map(inq => ({
      id: inq.id,
      contactName: inq.contactName,
      businessName: inq.businessName,
      retailerName: inq.catalogLink.retailer.name,
      createdAt: inq.createdAt,
      status: inq.status
    }))
  };
}

// ========================================
// PDF DOWNLOAD TRACKING
// ========================================

/**
 * Track PDF download
 * @param catalogLinkId - The catalog link ID
 * @param metadata - Optional IP and user agent
 * @param options - Optional settings (skipTracking: true for internal views)
 */
export async function trackPdfDownload(
  catalogLinkId: string,
  metadata?: { ip?: string; userAgent?: string },
  options?: { skipTracking?: boolean }
) {
  // Skip tracking for internal views
  if (options?.skipTracking) {
    return;
  }

  const link = await prisma.catalogLink.findUnique({
    where: { id: catalogLinkId },
    include: { retailer: { select: { name: true } } }
  });

  if (!link) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Catalog link not found');
  }

  await logAction({
    entityType: ActivityEntity.CATALOG_LINK,
    entityId: catalogLinkId,
    action: 'catalog_pdf_downloaded',
    ipAddress: metadata?.ip,
    userAgent: metadata?.userAgent,
    summary: `PDF catalog downloaded for ${link.retailer.name}`,
    metadata: {
      token: link.token,
      retailerId: link.retailerId,
      retailerName: link.retailer.name
    },
    tags: ['catalog', 'pdf', 'download', 'public']
  });
}

// ========================================
// URL HELPERS
// ========================================

/**
 * Get the base URL for catalog links
 */
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

/**
 * Build the public URL for a catalog link
 */
export function buildCatalogUrl(token: string): string {
  return `${getBaseUrl()}/catalog/${token}`;
}

// ========================================
// CATALOG REQUESTS (QUOTE/SAMPLE)
// ========================================

/**
 * Submit a catalog request (quote or sample request from retailer)
 */
export async function submitCatalogRequest(params: SubmitCatalogRequestParams) {
  const { catalogLinkId, items, contactName, contactEmail, contactPhone, message } = params;

  if (!items || items.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'At least one item is required');
  }

  // Validate sample items have reasons
  for (const item of items) {
    if (item.itemType === 'SAMPLE' && !item.sampleReason?.trim()) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Sample requests require a reason');
    }
    if (item.quantity < 1) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Quantity must be at least 1');
    }
  }

  const link = await prisma.catalogLink.findUnique({
    where: { id: catalogLinkId },
    include: {
      retailer: { select: { id: true, name: true, salesRepId: true } }
    }
  });

  if (!link) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Catalog link not found');
  }

  // Validate product IDs
  const productIds = items.map(item => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, active: true },
    select: { id: true, name: true }
  });
  const validProductIds = new Set(products.map(p => p.id));
  const invalidProductIds = productIds.filter(id => !validProductIds.has(id));
  if (invalidProductIds.length > 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, `Invalid product IDs: ${invalidProductIds.join(', ')}`);
  }

  // Create the request with items
  const request = await prisma.catalogRequest.create({
    data: {
      catalogLinkId,
      contactName,
      contactEmail,
      contactPhone,
      message,
      assignedToId: link.retailer.salesRepId, // Auto-assign to retailer's sales rep
      status: CatalogRequestStatus.NEW,
      items: {
        create: items.map(item => ({
          productId: item.productId,
          itemType: item.itemType as CatalogRequestItemType,
          quantity: item.quantity,
          sampleReason: item.sampleReason || null
        }))
      }
    },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true } }
        }
      }
    }
  });

  // Log the request
  const quoteItems = items.filter(i => i.itemType === 'QUOTE');
  const sampleItems = items.filter(i => i.itemType === 'SAMPLE');

  await logAction({
    entityType: ActivityEntity.CATALOG_LINK,
    entityId: catalogLinkId,
    action: 'catalog_request_submitted',
    summary: `New request from ${contactName || 'Anonymous'}: ${quoteItems.length} quote items, ${sampleItems.length} sample requests`,
    metadata: {
      requestId: request.id,
      token: link.token,
      retailerId: link.retailerId,
      retailerName: link.retailer.name,
      contactName,
      contactEmail,
      quoteItemCount: quoteItems.length,
      sampleItemCount: sampleItems.length,
      assignedToId: link.retailer.salesRepId
    },
    tags: ['catalog', 'request', 'public']
  });

  return request;
}

/**
 * Get a catalog request by ID
 */
export async function getCatalogRequest(id: string): Promise<CatalogRequestWithItems | null> {
  const request = await prisma.catalogRequest.findUnique({
    where: { id },
    include: {
      catalogLink: {
        include: {
          retailer: { select: { id: true, name: true, salesRepId: true } }
        }
      },
      assignedTo: { select: { id: true, name: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, publicImageUrl: true } }
        }
      }
    }
  });

  if (!request) return null;

  return {
    id: request.id,
    catalogLinkId: request.catalogLinkId,
    contactName: request.contactName,
    contactEmail: request.contactEmail,
    contactPhone: request.contactPhone,
    message: request.message,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    catalogLink: {
      token: request.catalogLink.token,
      displayName: request.catalogLink.displayName,
      retailer: request.catalogLink.retailer
    },
    assignedTo: request.assignedTo,
    items: request.items
  };
}

/**
 * List catalog requests with filters
 */
export async function listCatalogRequests(options?: {
  catalogLinkId?: string;
  assignedToId?: string;
  status?: CatalogRequestStatus;
  limit?: number;
  offset?: number;
}) {
  const where: Prisma.CatalogRequestWhereInput = {};
  if (options?.catalogLinkId) where.catalogLinkId = options.catalogLinkId;
  if (options?.assignedToId) where.assignedToId = options.assignedToId;
  if (options?.status) where.status = options.status;

  const [requests, total] = await Promise.all([
    prisma.catalogRequest.findMany({
      where,
      include: {
        catalogLink: {
          include: {
            retailer: { select: { id: true, name: true, salesRepId: true } }
          }
        },
        assignedTo: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, publicImageUrl: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0
    }),
    prisma.catalogRequest.count({ where })
  ]);

  return { requests, total };
}

/**
 * Update catalog request status
 */
export async function updateCatalogRequestStatus(
  id: string,
  status: CatalogRequestStatus,
  userId?: string,
  notes?: string
) {
  const existing = await prisma.catalogRequest.findUnique({
    where: { id },
    include: {
      catalogLink: {
        include: { retailer: { select: { name: true } } }
      }
    }
  });

  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Catalog request not found');
  }

  const updated = await prisma.catalogRequest.update({
    where: { id },
    data: {
      status,
      notes: notes ?? existing.notes,
      respondedAt: status !== CatalogRequestStatus.NEW ? new Date() : undefined
    }
  });

  await logAction({
    entityType: ActivityEntity.CATALOG_LINK,
    entityId: existing.catalogLinkId,
    action: 'catalog_request_status_updated',
    userId,
    summary: `Request status changed to ${status}`,
    before: { status: existing.status },
    after: { status },
    metadata: {
      requestId: id,
      retailerName: existing.catalogLink.retailer.name
    },
    tags: ['catalog', 'request', 'update']
  });

  return updated;
}

/**
 * Get request counts by status for a user (for dashboard)
 */
export async function getRequestCountsByStatus(assignedToId?: string) {
  const where: Prisma.CatalogRequestWhereInput = assignedToId ? { assignedToId } : {};

  const counts = await prisma.catalogRequest.groupBy({
    by: ['status'],
    where,
    _count: true
  });

  const result: Record<string, number> = {
    NEW: 0,
    CONTACTED: 0,
    QUOTED: 0,
    CLOSED: 0
  };

  for (const count of counts) {
    result[count.status] = count._count;
  }

  return result;
}

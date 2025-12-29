/**
 * AI Entity Resolver Service
 * 
 * Enhanced entity resolution for AI-parsed orders with deterministic confidence scoring.
 * Returns structured results with match types and alternatives for ambiguous matches.
 * 
 * CONFIDENCE SCORING (deterministic):
 * - Base score: 1.0
 * - -0.2 per fuzzy match (partial name match)
 * - -0.4 per ambiguous match (multiple possibilities)
 * - -0.3 if pricing missing (for purchase orders)
 * - -0.5 if any required field unresolved
 * 
 * MATCH TYPES:
 * - exact: Direct ID match or exact name/SKU match
 * - fuzzy: Partial match (e.g., "PE" -> "Penis Envy")
 * - ambiguous: Multiple matches found - BLOCKS proposal creation
 * - none: No matches found
 */

import { prisma } from '@/lib/db/prisma';

// ========================================
// Types
// ========================================

export type MatchType = 'exact' | 'fuzzy' | 'ambiguous' | 'none';

export interface EntityMatch<T> {
  matchType: MatchType;
  entity: T | null;
  alternatives: T[];
  confidencePenalty: number; // Amount to subtract from confidence
}

export interface ResolvedProduct {
  id: string;
  name: string;
  sku: string;
  wholesalePrice: number | null;
}

export interface ResolvedMaterial {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
}

export interface ResolvedRetailer {
  id: string;
  name: string;
  shippingAddress: string | null;
}

export interface ResolvedVendor {
  id: string;
  name: string;
  contactEmail: string | null;
}

export interface MaterialVendorPricing {
  lastPrice: number | null;  // Most recent price from this vendor
  moq: number | null;        // Minimum order quantity
  leadTimeDays: number | null;
}

// ========================================
// Confidence Penalties (deterministic)
// ========================================

export const CONFIDENCE_PENALTIES = {
  FUZZY_MATCH: 0.2,
  AMBIGUOUS_MATCH: 0.4,
  MISSING_PRICING: 0.3,
  UNRESOLVED_FIELD: 0.5,
} as const;

// ========================================
// Product Resolution
// ========================================

/**
 * Resolve a product reference with confidence scoring
 */
export async function resolveProductWithConfidence(ref: string): Promise<EntityMatch<ResolvedProduct>> {
  const normalizedRef = ref.trim();
  
  // 1. Try exact ID match
  if (normalizedRef.startsWith('cl') || normalizedRef.startsWith('cm')) {
    const byId = await prisma.product.findUnique({
      where: { id: normalizedRef },
      select: { id: true, name: true, sku: true, wholesalePrice: true, active: true }
    });
    if (byId && byId.active) {
      return {
        matchType: 'exact',
        entity: byId,
        alternatives: [],
        confidencePenalty: 0
      };
    }
  }

  // 2. Try exact SKU match (case-insensitive)
  const bySku = await prisma.product.findFirst({
    where: { sku: normalizedRef.toUpperCase(), active: true },
    select: { id: true, name: true, sku: true, wholesalePrice: true }
  });
  if (bySku) {
    return {
      matchType: 'exact',
      entity: bySku,
      alternatives: [],
      confidencePenalty: 0
    };
  }

  // 3. Try exact name match (case-insensitive)
  const byExactName = await prisma.product.findFirst({
    where: { 
      name: { equals: normalizedRef, mode: 'insensitive' },
      active: true 
    },
    select: { id: true, name: true, sku: true, wholesalePrice: true }
  });
  if (byExactName) {
    return {
      matchType: 'exact',
      entity: byExactName,
      alternatives: [],
      confidencePenalty: 0
    };
  }

  // 4. Try partial name match (fuzzy)
  const partialMatches = await prisma.product.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: normalizedRef, mode: 'insensitive' } },
        { sku: { contains: normalizedRef, mode: 'insensitive' } },
      ]
    },
    select: { id: true, name: true, sku: true, wholesalePrice: true },
    take: 10
  });

  if (partialMatches.length === 1) {
    return {
      matchType: 'fuzzy',
      entity: partialMatches[0],
      alternatives: [],
      confidencePenalty: CONFIDENCE_PENALTIES.FUZZY_MATCH
    };
  }

  if (partialMatches.length > 1) {
    return {
      matchType: 'ambiguous',
      entity: null,
      alternatives: partialMatches,
      confidencePenalty: CONFIDENCE_PENALTIES.AMBIGUOUS_MATCH
    };
  }

  // 5. No match found
  return {
    matchType: 'none',
    entity: null,
    alternatives: [],
    confidencePenalty: CONFIDENCE_PENALTIES.UNRESOLVED_FIELD
  };
}

// ========================================
// Material Resolution
// ========================================

/**
 * Resolve a material reference with confidence scoring
 */
export async function resolveMaterialWithConfidence(ref: string): Promise<EntityMatch<ResolvedMaterial>> {
  const normalizedRef = ref.trim();
  
  // 1. Try exact ID match
  if (normalizedRef.startsWith('cl') || normalizedRef.startsWith('cm')) {
    const byId = await prisma.rawMaterial.findUnique({
      where: { id: normalizedRef },
      select: { id: true, name: true, sku: true, unitOfMeasure: true, active: true }
    });
    if (byId && byId.active) {
      return {
        matchType: 'exact',
        entity: byId,
        alternatives: [],
        confidencePenalty: 0
      };
    }
  }

  // 2. Try exact SKU match
  const bySku = await prisma.rawMaterial.findFirst({
    where: { sku: normalizedRef.toUpperCase(), active: true },
    select: { id: true, name: true, sku: true, unitOfMeasure: true }
  });
  if (bySku) {
    return {
      matchType: 'exact',
      entity: bySku,
      alternatives: [],
      confidencePenalty: 0
    };
  }

  // 3. Try exact name match
  const byExactName = await prisma.rawMaterial.findFirst({
    where: { 
      name: { equals: normalizedRef, mode: 'insensitive' },
      active: true 
    },
    select: { id: true, name: true, sku: true, unitOfMeasure: true }
  });
  if (byExactName) {
    return {
      matchType: 'exact',
      entity: byExactName,
      alternatives: [],
      confidencePenalty: 0
    };
  }

  // 4. Try partial name match
  const partialMatches = await prisma.rawMaterial.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: normalizedRef, mode: 'insensitive' } },
        { sku: { contains: normalizedRef, mode: 'insensitive' } },
      ]
    },
    select: { id: true, name: true, sku: true, unitOfMeasure: true },
    take: 10
  });

  if (partialMatches.length === 1) {
    return {
      matchType: 'fuzzy',
      entity: partialMatches[0],
      alternatives: [],
      confidencePenalty: CONFIDENCE_PENALTIES.FUZZY_MATCH
    };
  }

  if (partialMatches.length > 1) {
    return {
      matchType: 'ambiguous',
      entity: null,
      alternatives: partialMatches,
      confidencePenalty: CONFIDENCE_PENALTIES.AMBIGUOUS_MATCH
    };
  }

  return {
    matchType: 'none',
    entity: null,
    alternatives: [],
    confidencePenalty: CONFIDENCE_PENALTIES.UNRESOLVED_FIELD
  };
}

// ========================================
// Retailer Resolution
// ========================================

/**
 * Resolve a retailer reference with confidence scoring
 */
export async function resolveRetailerWithConfidence(ref: string): Promise<EntityMatch<ResolvedRetailer>> {
  const normalizedRef = ref.trim();
  
  // 1. Try exact ID match
  if (normalizedRef.startsWith('cl') || normalizedRef.startsWith('cm')) {
    const byId = await prisma.retailer.findUnique({
      where: { id: normalizedRef },
      select: { id: true, name: true, shippingAddress: true, active: true }
    });
    if (byId && byId.active) {
      return {
        matchType: 'exact',
        entity: byId,
        alternatives: [],
        confidencePenalty: 0
      };
    }
  }

  // 2. Try exact name match
  const byExactName = await prisma.retailer.findFirst({
    where: { 
      name: { equals: normalizedRef, mode: 'insensitive' },
      active: true 
    },
    select: { id: true, name: true, shippingAddress: true }
  });
  if (byExactName) {
    return {
      matchType: 'exact',
      entity: byExactName,
      alternatives: [],
      confidencePenalty: 0
    };
  }

  // 3. Try partial name match
  const partialMatches = await prisma.retailer.findMany({
    where: {
      active: true,
      name: { contains: normalizedRef, mode: 'insensitive' }
    },
    select: { id: true, name: true, shippingAddress: true },
    take: 10
  });

  if (partialMatches.length === 1) {
    return {
      matchType: 'fuzzy',
      entity: partialMatches[0],
      alternatives: [],
      confidencePenalty: CONFIDENCE_PENALTIES.FUZZY_MATCH
    };
  }

  if (partialMatches.length > 1) {
    return {
      matchType: 'ambiguous',
      entity: null,
      alternatives: partialMatches,
      confidencePenalty: CONFIDENCE_PENALTIES.AMBIGUOUS_MATCH
    };
  }

  return {
    matchType: 'none',
    entity: null,
    alternatives: [],
    confidencePenalty: CONFIDENCE_PENALTIES.UNRESOLVED_FIELD
  };
}

// ========================================
// Vendor Resolution
// ========================================

/**
 * Resolve a vendor reference with confidence scoring
 */
export async function resolveVendorWithConfidence(ref: string): Promise<EntityMatch<ResolvedVendor>> {
  const normalizedRef = ref.trim();
  
  // 1. Try exact ID match
  if (normalizedRef.startsWith('cl') || normalizedRef.startsWith('cm')) {
    const byId = await prisma.vendor.findUnique({
      where: { id: normalizedRef },
      select: { id: true, name: true, contactEmail: true, active: true }
    });
    if (byId && byId.active) {
      return {
        matchType: 'exact',
        entity: byId,
        alternatives: [],
        confidencePenalty: 0
      };
    }
  }

  // 2. Try exact name match
  const byExactName = await prisma.vendor.findFirst({
    where: { 
      name: { equals: normalizedRef, mode: 'insensitive' },
      active: true 
    },
    select: { id: true, name: true, contactEmail: true }
  });
  if (byExactName) {
    return {
      matchType: 'exact',
      entity: byExactName,
      alternatives: [],
      confidencePenalty: 0
    };
  }

  // 3. Try partial name match
  const partialMatches = await prisma.vendor.findMany({
    where: {
      active: true,
      name: { contains: normalizedRef, mode: 'insensitive' }
    },
    select: { id: true, name: true, contactEmail: true },
    take: 10
  });

  if (partialMatches.length === 1) {
    return {
      matchType: 'fuzzy',
      entity: partialMatches[0],
      alternatives: [],
      confidencePenalty: CONFIDENCE_PENALTIES.FUZZY_MATCH
    };
  }

  if (partialMatches.length > 1) {
    return {
      matchType: 'ambiguous',
      entity: null,
      alternatives: partialMatches,
      confidencePenalty: CONFIDENCE_PENALTIES.AMBIGUOUS_MATCH
    };
  }

  return {
    matchType: 'none',
    entity: null,
    alternatives: [],
    confidencePenalty: CONFIDENCE_PENALTIES.UNRESOLVED_FIELD
  };
}

// ========================================
// Material-Vendor Pricing
// ========================================

/**
 * Get pricing for a material from a specific vendor
 */
export async function getMaterialVendorPricing(
  materialId: string,
  vendorId: string
): Promise<MaterialVendorPricing | null> {
  const materialVendor = await prisma.materialVendor.findUnique({
    where: {
      materialId_vendorId: { materialId, vendorId }
    },
    select: {
      lastPrice: true,
      moq: true,
      leadTimeDays: true
    }
  });

  return materialVendor;
}

/**
 * Get preferred vendor pricing for a material
 */
export async function getPreferredMaterialPricing(
  materialId: string
): Promise<{ vendorId: string; vendorName: string; pricing: MaterialVendorPricing } | null> {
  const material = await prisma.rawMaterial.findUnique({
    where: { id: materialId },
    include: {
      preferredVendor: {
        select: { id: true, name: true }
      }
    }
  });

  if (!material?.preferredVendorId || !material.preferredVendor) {
    return null;
  }

  const pricing = await getMaterialVendorPricing(materialId, material.preferredVendorId);
  if (!pricing) {
    return null;
  }

  return {
    vendorId: material.preferredVendorId,
    vendorName: material.preferredVendor.name,
    pricing
  };
}

// ========================================
// Confidence Score Calculator
// ========================================

/**
 * Calculate overall confidence score from penalties
 */
export function calculateConfidenceScore(penalties: number[]): number {
  const totalPenalty = penalties.reduce((sum, p) => sum + p, 0);
  return Math.max(0, 1.0 - totalPenalty);
}

/**
 * Check if any matches are ambiguous (blocks proposal creation)
 */
export function hasAmbiguousMatches(matchTypes: MatchType[]): boolean {
  return matchTypes.includes('ambiguous');
}

/**
 * Check if any required fields are unresolved
 */
export function hasUnresolvedFields(matchTypes: MatchType[]): boolean {
  return matchTypes.includes('none');
}


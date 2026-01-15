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
// Word-Overlap Fuzzy Matching
// ========================================

/**
 * Tokenize a string into normalized words for comparison
 * - Lowercases everything
 * - Splits on non-alphanumeric characters
 * - Preserves numbers with units (e.g., "10g" stays together)
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_,]+/)
    .map(word => word.replace(/[^a-z0-9]/g, ''))
    .filter(word => word.length > 0);
}

/**
 * Calculate word overlap score between search query and target
 * Returns a score between 0 and 1 based on how many query words are found in target
 */
function calculateWordOverlap(searchRef: string, targetName: string): number {
  const searchTokens = tokenize(searchRef);
  const targetTokens = tokenize(targetName);
  
  if (searchTokens.length === 0) return 0;
  
  // Count how many search tokens are found in target tokens
  let matchedTokens = 0;
  for (const searchToken of searchTokens) {
    // Check for exact token match or if target contains the search token
    const found = targetTokens.some(targetToken => 
      targetToken === searchToken || 
      targetToken.includes(searchToken) ||
      searchToken.includes(targetToken)
    );
    if (found) matchedTokens++;
  }
  
  // Score based on percentage of search tokens matched
  return matchedTokens / searchTokens.length;
}

/**
 * Find entities by word overlap matching
 * Returns entities where at least minOverlap (0-1) of search tokens match
 */
interface WordOverlapMatch<T> {
  entity: T;
  score: number;
}

function findByWordOverlap<T extends { name: string }>(
  searchRef: string,
  entities: T[],
  minOverlap: number = 0.6
): WordOverlapMatch<T>[] {
  const matches: WordOverlapMatch<T>[] = [];
  
  for (const entity of entities) {
    const score = calculateWordOverlap(searchRef, entity.name);
    if (score >= minOverlap) {
      matches.push({ entity, score });
    }
  }
  
  // Sort by score descending
  return matches.sort((a, b) => b.score - a.score);
}

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

  // 4. Try partial name/SKU containment match (fuzzy)
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

  // 5. Try word-overlap matching (for cases like "Aphrodite Desire Capsules 10g" -> "Aphrodite 10g")
  const allActiveProducts = await prisma.product.findMany({
    where: { active: true },
    select: { id: true, name: true, sku: true, wholesalePrice: true }
  });
  
  const wordOverlapMatches = findByWordOverlap(normalizedRef, allActiveProducts, 0.5);
  
  if (wordOverlapMatches.length === 1) {
    return {
      matchType: 'fuzzy',
      entity: wordOverlapMatches[0].entity,
      alternatives: [],
      confidencePenalty: CONFIDENCE_PENALTIES.FUZZY_MATCH
    };
  }
  
  // If we have multiple matches with similar high scores, it's ambiguous
  if (wordOverlapMatches.length > 1) {
    // Check if the top match is significantly better than others
    const topScore = wordOverlapMatches[0].score;
    const closeMatches = wordOverlapMatches.filter(m => m.score >= topScore * 0.9);
    
    if (closeMatches.length === 1) {
      // Clear winner
      return {
        matchType: 'fuzzy',
        entity: closeMatches[0].entity,
        alternatives: wordOverlapMatches.slice(1).map(m => m.entity),
        confidencePenalty: CONFIDENCE_PENALTIES.FUZZY_MATCH
      };
    }
    
    return {
      matchType: 'ambiguous',
      entity: null,
      alternatives: wordOverlapMatches.map(m => m.entity),
      confidencePenalty: CONFIDENCE_PENALTIES.AMBIGUOUS_MATCH
    };
  }

  // 6. No match found
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

  // 4. Try partial name/SKU containment match
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

  // 5. Try word-overlap matching
  const allActiveMaterials = await prisma.rawMaterial.findMany({
    where: { active: true },
    select: { id: true, name: true, sku: true, unitOfMeasure: true }
  });
  
  const wordOverlapMatches = findByWordOverlap(normalizedRef, allActiveMaterials, 0.5);
  
  if (wordOverlapMatches.length === 1) {
    return {
      matchType: 'fuzzy',
      entity: wordOverlapMatches[0].entity,
      alternatives: [],
      confidencePenalty: CONFIDENCE_PENALTIES.FUZZY_MATCH
    };
  }
  
  if (wordOverlapMatches.length > 1) {
    const topScore = wordOverlapMatches[0].score;
    const closeMatches = wordOverlapMatches.filter(m => m.score >= topScore * 0.9);
    
    if (closeMatches.length === 1) {
      return {
        matchType: 'fuzzy',
        entity: closeMatches[0].entity,
        alternatives: wordOverlapMatches.slice(1).map(m => m.entity),
        confidencePenalty: CONFIDENCE_PENALTIES.FUZZY_MATCH
      };
    }
    
    return {
      matchType: 'ambiguous',
      entity: null,
      alternatives: wordOverlapMatches.map(m => m.entity),
      confidencePenalty: CONFIDENCE_PENALTIES.AMBIGUOUS_MATCH
    };
  }

  // 6. No match found
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

  // 3. Try partial name containment match
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

  // 4. Try word-overlap matching (for cases like "The Other Path CBD Store" -> "Other Path")
  const allActiveRetailers = await prisma.retailer.findMany({
    where: { active: true },
    select: { id: true, name: true, shippingAddress: true }
  });
  
  const wordOverlapMatches = findByWordOverlap(normalizedRef, allActiveRetailers, 0.5);
  
  if (wordOverlapMatches.length === 1) {
    return {
      matchType: 'fuzzy',
      entity: wordOverlapMatches[0].entity,
      alternatives: [],
      confidencePenalty: CONFIDENCE_PENALTIES.FUZZY_MATCH
    };
  }
  
  if (wordOverlapMatches.length > 1) {
    const topScore = wordOverlapMatches[0].score;
    const closeMatches = wordOverlapMatches.filter(m => m.score >= topScore * 0.9);
    
    if (closeMatches.length === 1) {
      return {
        matchType: 'fuzzy',
        entity: closeMatches[0].entity,
        alternatives: wordOverlapMatches.slice(1).map(m => m.entity),
        confidencePenalty: CONFIDENCE_PENALTIES.FUZZY_MATCH
      };
    }
    
    return {
      matchType: 'ambiguous',
      entity: null,
      alternatives: wordOverlapMatches.map(m => m.entity),
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

  // 3. Try partial name containment match
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

  // 4. Try word-overlap matching
  const allActiveVendors = await prisma.vendor.findMany({
    where: { active: true },
    select: { id: true, name: true, contactEmail: true }
  });
  
  const wordOverlapMatches = findByWordOverlap(normalizedRef, allActiveVendors, 0.5);
  
  if (wordOverlapMatches.length === 1) {
    return {
      matchType: 'fuzzy',
      entity: wordOverlapMatches[0].entity,
      alternatives: [],
      confidencePenalty: CONFIDENCE_PENALTIES.FUZZY_MATCH
    };
  }
  
  if (wordOverlapMatches.length > 1) {
    const topScore = wordOverlapMatches[0].score;
    const closeMatches = wordOverlapMatches.filter(m => m.score >= topScore * 0.9);
    
    if (closeMatches.length === 1) {
      return {
        matchType: 'fuzzy',
        entity: closeMatches[0].entity,
        alternatives: wordOverlapMatches.slice(1).map(m => m.entity),
        confidencePenalty: CONFIDENCE_PENALTIES.FUZZY_MATCH
      };
    }
    
    return {
      matchType: 'ambiguous',
      entity: null,
      alternatives: wordOverlapMatches.map(m => m.entity),
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


/**
 * API Route: GET /api/lookup/resolve
 * 
 * Resolves natural language references to database entities.
 * Returns alternatives when ambiguous (resolved: false).
 * 
 * Query Params:
 * - ref (required): The reference string (e.g., "PE", "Penis Envy")
 * - type (optional): Entity type hint (product, material, retailer, location, batch, vendor)
 * 
 * GOVERNANCE:
 * - Returns alternatives when ambiguous (never auto-picks)
 * - Forces clarification for safety
 */

import { NextRequest } from 'next/server';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import {
  resolveMaterialRef,
  resolveProductRef,
  resolveRetailerRef,
  resolveLocationRef,
  resolveBatchRef,
  resolveVendorRef,
} from '@/lib/services/aiCommandService';
import { prisma } from '@/lib/db/prisma';
import { authenticateAIRequest } from '@/lib/auth/aiAuth';

type EntityType = 'product' | 'material' | 'retailer' | 'location' | 'batch' | 'vendor';

type ResolvedEntity = {
  id: string;
  name: string;
  sku?: string;
  type: EntityType;
};

type ResolveResult = {
  resolved: boolean;
  entityType?: EntityType;
  entity?: ResolvedEntity;
  confidence: 'exact' | 'fuzzy' | 'abbreviation' | 'ambiguous';
  alternatives: ResolvedEntity[];
};

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate (API key or session)
    const aiAuth = await authenticateAIRequest(req);
    
    if (!aiAuth.authenticated || !aiAuth.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // 2. Check permission (need at least inventory view for lookups)
    if (!hasPermission(aiAuth.user.role, 'inventory', 'view')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // 3. Parse query params
    const searchParams = req.nextUrl.searchParams;
    const ref = searchParams.get('ref');
    const typeHint = searchParams.get('type') as EntityType | null;

    if (!ref) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'ref query parameter is required');
    }

    // 4. Resolve based on type hint or try all types
    const result = await resolveReference(ref, typeHint);

    // 5. Return result
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

async function resolveReference(ref: string, typeHint: EntityType | null): Promise<ResolveResult> {
  const alternatives: ResolvedEntity[] = [];

  // If type hint provided, only search that type
  if (typeHint) {
    const result = await resolveByType(ref, typeHint);
    if (result.entity) {
      return {
        resolved: true,
        entityType: typeHint,
        entity: result.entity,
        confidence: result.confidence,
        alternatives: [],
      };
    }

    // If no match found with hint, search for alternatives
    const allMatches = await findAllMatches(ref);
    return {
      resolved: false,
      confidence: 'ambiguous',
      alternatives: allMatches,
    };
  }

  // No type hint - search all types and collect matches
  const allMatches = await findAllMatches(ref);

  // If exactly one match, return it
  if (allMatches.length === 1) {
    return {
      resolved: true,
      entityType: allMatches[0].type,
      entity: allMatches[0],
      confidence: 'exact',
      alternatives: [],
    };
  }

  // If multiple matches, return as ambiguous
  if (allMatches.length > 1) {
    return {
      resolved: false,
      confidence: 'ambiguous',
      alternatives: allMatches,
    };
  }

  // No matches found
  return {
    resolved: false,
    confidence: 'ambiguous',
    alternatives: [],
  };
}

async function resolveByType(
  ref: string,
  type: EntityType
): Promise<{ entity: ResolvedEntity | null; confidence: 'exact' | 'fuzzy' | 'abbreviation' }> {
  switch (type) {
    case 'material': {
      const material = await resolveMaterialRef(ref);
      if (material) {
        return {
          entity: { id: material.id, name: material.name, sku: material.sku, type: 'material' },
          confidence: 'exact',
        };
      }
      break;
    }
    case 'product': {
      const product = await resolveProductRef(ref);
      if (product) {
        return {
          entity: { id: product.id, name: product.name, sku: product.sku, type: 'product' },
          confidence: 'exact',
        };
      }
      break;
    }
    case 'retailer': {
      const retailer = await resolveRetailerRef(ref);
      if (retailer) {
        return {
          entity: { id: retailer.id, name: retailer.name, type: 'retailer' },
          confidence: 'exact',
        };
      }
      break;
    }
    case 'location': {
      const location = await resolveLocationRef(ref);
      if (location) {
        return {
          entity: { id: location.id, name: location.name, type: 'location' },
          confidence: 'exact',
        };
      }
      break;
    }
    case 'batch': {
      const batch = await resolveBatchRef(ref);
      if (batch) {
        return {
          entity: { id: batch.id, name: batch.batchCode, type: 'batch' },
          confidence: 'exact',
        };
      }
      break;
    }
    case 'vendor': {
      const vendor = await resolveVendorRef(ref);
      if (vendor) {
        return {
          entity: { id: vendor.id, name: vendor.name, type: 'vendor' },
          confidence: 'exact',
        };
      }
      break;
    }
  }

  return { entity: null, confidence: 'exact' };
}

async function findAllMatches(ref: string): Promise<ResolvedEntity[]> {
  const matches: ResolvedEntity[] = [];
  const normalizedRef = ref.toLowerCase();

  // Search materials
  const materials = await prisma.rawMaterial.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: ref, mode: 'insensitive' } },
        { sku: { contains: ref, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, sku: true },
    take: 5,
  });
  for (const m of materials) {
    matches.push({ id: m.id, name: m.name, sku: m.sku, type: 'material' });
  }

  // Search products
  const products = await prisma.product.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: ref, mode: 'insensitive' } },
        { sku: { contains: ref, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, sku: true },
    take: 5,
  });
  for (const p of products) {
    matches.push({ id: p.id, name: p.name, sku: p.sku, type: 'product' });
  }

  // Search vendors
  const vendors = await prisma.vendor.findMany({
    where: {
      active: true,
      name: { contains: ref, mode: 'insensitive' },
    },
    select: { id: true, name: true },
    take: 3,
  });
  for (const v of vendors) {
    matches.push({ id: v.id, name: v.name, type: 'vendor' });
  }

  // Search locations
  const locations = await prisma.location.findMany({
    where: {
      active: true,
      name: { contains: ref, mode: 'insensitive' },
    },
    select: { id: true, name: true },
    take: 3,
  });
  for (const l of locations) {
    matches.push({ id: l.id, name: l.name, type: 'location' });
  }

  // Search retailers
  const retailers = await prisma.retailer.findMany({
    where: {
      active: true,
      name: { contains: ref, mode: 'insensitive' },
    },
    select: { id: true, name: true },
    take: 3,
  });
  for (const r of retailers) {
    matches.push({ id: r.id, name: r.name, type: 'retailer' });
  }

  // Search batches
  const batches = await prisma.batch.findMany({
    where: {
      batchCode: { contains: ref.toUpperCase() },
    },
    select: { id: true, batchCode: true },
    take: 3,
  });
  for (const b of batches) {
    matches.push({ id: b.id, name: b.batchCode, type: 'batch' });
  }

  return matches;
}


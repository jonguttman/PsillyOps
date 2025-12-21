/**
 * API Route: UPC Lookup
 * 
 * Resolves a UPC/EAN barcode to a product or material entity.
 * Used by mobile scanning to identify scanned items.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { resolveScan, linkUPC, findLinkCandidates } from '@/lib/services/scanResolverService';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';

interface RouteParams {
  params: Promise<{ code: string }>;
}

/**
 * GET /api/lookup/upc/[code]
 * 
 * Resolve a UPC to its entity and available actions
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { code } = await params;
    
    if (!code || code.length < 8) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Invalid UPC code' },
        { status: 400 }
      );
    }

    const result = await resolveScan(code);

    return Response.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/lookup/upc/[code]
 * 
 * Link a UPC to an existing product or material
 * Requires inventory:adjust permission
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN and WAREHOUSE can link UPCs
    if (!hasPermission(session.user.role, 'inventory', 'adjust')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions to link UPC' },
        { status: 403 }
      );
    }

    const { code } = await params;
    const body = await req.json();
    
    const { entityType, entityId } = body;
    
    if (!entityType || !entityId) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'entityType and entityId are required' },
        { status: 400 }
      );
    }
    
    if (entityType !== 'PRODUCT' && entityType !== 'MATERIAL') {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'entityType must be PRODUCT or MATERIAL' },
        { status: 400 }
      );
    }

    const result = await linkUPC({
      upc: code,
      entityType,
      entityId,
    });

    if (!result.success) {
      return Response.json(
        { code: 'LINK_FAILED', message: result.error },
        { status: 400 }
      );
    }

    return Response.json({ ok: true, message: 'UPC linked successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}


/**
 * API Route: Search for UPC Link Candidates
 * 
 * Searches products and materials that could be linked to a UPC.
 * Used by mobile scanning when a UPC isn't linked yet.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { findLinkCandidates } from '@/lib/services/scanResolverService';
import { handleApiError } from '@/lib/utils/errors';

/**
 * GET /api/lookup/search?q=searchTerm
 * 
 * Search for products/materials to link to a UPC
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    
    if (query.length < 2) {
      return Response.json({
        ok: true,
        products: [],
        materials: [],
      });
    }

    const results = await findLinkCandidates(query);

    return Response.json({
      ok: true,
      ...results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}


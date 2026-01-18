/**
 * GET /api/ops/catalog-requests
 *
 * List catalog requests (quote/sample) for the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { listCatalogRequests, getRequestCountsByStatus } from '@/lib/services/catalogLinkService';
import { CatalogRequestStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as CatalogRequestStatus | null;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // For REP users, only show their assigned requests
    // For ADMIN, show all requests
    const assignedToId = session.user.role === 'ADMIN' ? undefined : session.user.id;

    const [{ requests, total }, counts] = await Promise.all([
      listCatalogRequests({
        assignedToId,
        status: status || undefined,
        limit,
        offset
      }),
      getRequestCountsByStatus(assignedToId)
    ]);

    return NextResponse.json({
      requests,
      total,
      counts
    });
  } catch (error) {
    console.error('Catalog requests API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

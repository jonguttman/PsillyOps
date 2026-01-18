/**
 * PATCH /api/ops/catalog-requests/[id]
 *
 * Update catalog request status
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getCatalogRequest, updateCatalogRequestStatus } from '@/lib/services/catalogLinkService';
import { CatalogRequestStatus } from '@prisma/client';

const updateSchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'QUOTED', 'CLOSED']),
  notes: z.string().max(2000).optional()
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get the request
    const request = await getCatalogRequest(id);
    if (!request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Check access: REP can only update their assigned requests
    if (session.user.role !== 'ADMIN' && request.assignedTo?.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse body
    const body = await req.json();
    const { status, notes } = updateSchema.parse(body);

    // Update
    const updated = await updateCatalogRequestStatus(
      id,
      status as CatalogRequestStatus,
      session.user.id,
      notes
    );

    return NextResponse.json({ success: true, request: updated });
  } catch (error) {
    console.error('Update catalog request error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const request = await getCatalogRequest(id);
    if (!request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Check access: REP can only view their assigned requests
    if (session.user.role !== 'ADMIN' && request.assignedTo?.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ request });
  } catch (error) {
    console.error('Get catalog request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

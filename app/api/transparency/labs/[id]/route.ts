/**
 * API: Lab by ID
 * 
 * GET    /api/transparency/labs/[id] - Get a single lab
 * PATCH  /api/transparency/labs/[id] - Update a lab
 * DELETE /api/transparency/labs/[id] - Deactivate a lab (soft delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { isAdmin } from '@/lib/auth/rbac';
import {
  getLabById,
  updateLab,
  deactivateLab,
} from '@/lib/services/transparencyService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const lab = await getLabById(id);

    if (!lab) {
      return NextResponse.json({ error: 'Lab not found' }, { status: 404 });
    }

    return NextResponse.json(lab);
  } catch (error) {
    console.error('Error fetching lab:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lab' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const lab = await updateLab(
      id,
      {
        name: body.name,
        location: body.location,
        description: body.description,
        active: body.active,
      },
      session.user.id
    );

    return NextResponse.json(lab);
  } catch (error) {
    console.error('Error updating lab:', error);
    
    if (error instanceof Error && error.message === 'Lab not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to update lab' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    // Soft delete - deactivate instead of removing
    const lab = await deactivateLab(id, session.user.id);
    return NextResponse.json(lab);
  } catch (error) {
    console.error('Error deactivating lab:', error);
    
    if (error instanceof Error && error.message === 'Lab not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to deactivate lab' },
      { status: 500 }
    );
  }
}

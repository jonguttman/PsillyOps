/**
 * API: Lab Registry
 * 
 * GET  /api/transparency/labs - List all labs
 * POST /api/transparency/labs - Create a new lab (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { isAdmin } from '@/lib/auth/rbac';
import { listLabs, createLab } from '@/lib/services/transparencyService';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get('activeOnly') === 'true';

  try {
    const labs = await listLabs(activeOnly);
    return NextResponse.json(labs);
  } catch (error) {
    console.error('Error listing labs:', error);
    return NextResponse.json(
      { error: 'Failed to list labs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only admins can create labs
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.location) {
      return NextResponse.json(
        { error: 'Missing required fields: name, location' },
        { status: 400 }
      );
    }

    const lab = await createLab(
      {
        name: body.name,
        location: body.location,
        description: body.description,
        active: body.active,
      },
      session.user.id
    );

    return NextResponse.json(lab, { status: 201 });
  } catch (error) {
    console.error('Error creating lab:', error);
    return NextResponse.json(
      { error: 'Failed to create lab' },
      { status: 500 }
    );
  }
}

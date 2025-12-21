/**
 * API: System Config (Public Copy)
 * 
 * GET  /api/transparency/config - Get all transparency copy values
 * PUT  /api/transparency/config - Bulk update copy values (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { isAdmin } from '@/lib/auth/rbac';
import {
  getTransparencyCopy,
  updateTransparencyCopy,
  TransparencyCopyKey,
} from '@/lib/services/transparencyService';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only admins can view config
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const copy = await getTransparencyCopy();
    return NextResponse.json(copy);
  } catch (error) {
    console.error('Error fetching transparency copy:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transparency copy' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only admins can update config
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json() as Partial<Record<TransparencyCopyKey, string>>;

    await updateTransparencyCopy(body, session.user.id);

    // Return updated values
    const copy = await getTransparencyCopy();
    return NextResponse.json(copy);
  } catch (error) {
    console.error('Error updating transparency copy:', error);
    return NextResponse.json(
      { error: 'Failed to update transparency copy' },
      { status: 500 }
    );
  }
}

/**
 * Admin Sheet Revocation API
 * 
 * POST /api/admin/sheets/[id]/revoke - Revoke seal sheet (ADMIN only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { revokeSheet } from '@/lib/services/sealSheetService';
import { handleApiError } from '@/lib/utils/errors';
import { canAssignSealSheets } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only ADMIN can revoke sheets
    if (!canAssignSealSheets(session.user.role as UserRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. ADMIN role required.' },
        { status: 403 }
      );
    }

    const { id: sheetId } = await params;
    const body = await request.json();
    const { reason } = body;

    if (!reason) {
      return NextResponse.json(
        { error: 'reason is required' },
        { status: 400 }
      );
    }

    const sheet = await revokeSheet(sheetId, reason, session.user.id);

    return NextResponse.json({ sheet });
  } catch (error) {
    return handleApiError(error);
  }
}


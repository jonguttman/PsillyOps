/**
 * Admin Sheet Assignment API
 * 
 * POST /api/admin/sheets/[id]/assign - Assign seal sheet to partner (ADMIN only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { assignSheetToPartner } from '@/lib/services/sealSheetService';
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

    // Only ADMIN can assign sheets
    if (!canAssignSealSheets(session.user.role as UserRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. ADMIN role required.' },
        { status: 403 }
      );
    }

    const { id: sheetId } = await params;
    const body = await request.json();
    const { partnerId } = body;

    if (!partnerId) {
      return NextResponse.json(
        { error: 'partnerId is required' },
        { status: 400 }
      );
    }

    const sheet = await assignSheetToPartner(
      sheetId,
      partnerId,
      session.user.id
    );

    return NextResponse.json({ sheet });
  } catch (error) {
    return handleApiError(error);
  }
}


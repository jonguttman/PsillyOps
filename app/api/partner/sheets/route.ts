/**
 * Partner Sheets API
 * 
 * GET /api/partner/sheets - List seal sheets assigned to partner
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getSheetsByPartner } from '@/lib/services/sealSheetService';
import { handleApiError } from '@/lib/utils/errors';
import { isPartnerUser } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only partner users can list their sheets
    if (!isPartnerUser(session.user.role as UserRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    if (!session.user.partnerId) {
      return NextResponse.json(
        { error: 'User is not assigned to a partner' },
        { status: 400 }
      );
    }

    const sheets = await getSheetsByPartner(session.user.partnerId);

    return NextResponse.json({ sheets });
  } catch (error) {
    return handleApiError(error);
  }
}


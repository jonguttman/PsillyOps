/**
 * Admin Partners API
 * 
 * GET /api/admin/partners - List all partners (ADMIN only)
 * POST /api/admin/partners - Create partner (ADMIN only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { listPartners, createPartner } from '@/lib/services/partnerService';
import { handleApiError } from '@/lib/utils/errors';
import { isAdmin } from '@/lib/auth/rbac';
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

    // Only ADMIN can list partners
    if (!isAdmin(session.user.role as UserRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. ADMIN role required.' },
        { status: 403 }
      );
    }

    const partners = await listPartners();

    return NextResponse.json({ partners });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only ADMIN can create partners
    if (!isAdmin(session.user.role as UserRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. ADMIN role required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    const partner = await createPartner({
      name,
      createdById: session.user.id,
    });

    return NextResponse.json({ partner }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}


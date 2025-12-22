/**
 * Partner Products API
 * 
 * GET /api/partner/products - List partner products
 * POST /api/partner/products - Create partner product
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { listPartnerProducts, createPartnerProduct } from '@/lib/services/partnerProductService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
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

    // Only partner users can list their products
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

    const products = await listPartnerProducts(session.user.partnerId);

    return NextResponse.json({ products });
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

    // Only PARTNER_ADMIN can create products
    if (session.user.role !== 'PARTNER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions. PARTNER_ADMIN role required.' },
        { status: 403 }
      );
    }

    if (!session.user.partnerId) {
      return NextResponse.json(
        { error: 'User is not assigned to a partner' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, sku, vibesProfileId } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    const product = await createPartnerProduct({
      partnerId: session.user.partnerId,
      name,
      sku,
      vibesProfileId,
      createdById: session.user.id,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}


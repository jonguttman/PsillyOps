/**
 * Partner Bind API
 * 
 * POST /api/partner/bind - Bind a seal token to a product
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { bindSealToProduct } from '@/lib/services/experienceBindingService';
import { handleApiError } from '@/lib/utils/errors';
import { canBindSeals } from '@/lib/auth/rbac';
import { UserRole, BindingSource, ProductType } from '@prisma/client';
import { getTokenByValue } from '@/lib/services/qrTokenService';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only partner users can bind seals
    if (!canBindSeals(session.user.role as UserRole)) {
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

    const body = await request.json();
    const { token, productType, productRefId, vibesProfileId, boundVia } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'token is required' },
        { status: 400 }
      );
    }

    if (!productType || !['PARTNER', 'PSILLYOPS'].includes(productType)) {
      return NextResponse.json(
        { error: 'productType must be PARTNER or PSILLYOPS' },
        { status: 400 }
      );
    }

    if (!productRefId) {
      return NextResponse.json(
        { error: 'productRefId is required' },
        { status: 400 }
      );
    }

    // Get token record by token value
    const tokenRecord = await getTokenByValue(token);
    if (!tokenRecord) {
      return NextResponse.json(
        { error: 'Token not found' },
        { status: 404 }
      );
    }

    // Bind seal to product
    const binding = await bindSealToProduct({
      tokenId: tokenRecord.id,
      partnerId: session.user.partnerId,
      productType: productType as ProductType,
      productRefId,
      vibesProfileId,
      boundById: session.user.id,
      boundVia: (boundVia as BindingSource) || BindingSource.ADMIN_UI,
    });

    return NextResponse.json({ binding }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}


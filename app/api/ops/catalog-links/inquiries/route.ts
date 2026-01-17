/**
 * GET /api/ops/catalog-links/inquiries
 *
 * List all inquiries with optional filters.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { listInquiries } from '@/lib/services/catalogLinkService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { InquiryStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required');
    }

    const { searchParams } = new URL(req.url);
    const catalogLinkId = searchParams.get('catalogLinkId') || undefined;
    const status = searchParams.get('status') as InquiryStatus | undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { inquiries, total } = await listInquiries({
      catalogLinkId,
      status,
      limit,
      offset
    });

    return Response.json({
      inquiries,
      total,
      limit,
      offset
    });
  } catch (error) {
    return handleApiError(error);
  }
}

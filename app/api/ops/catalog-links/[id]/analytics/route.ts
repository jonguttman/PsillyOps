/**
 * GET /api/ops/catalog-links/[id]/analytics
 *
 * Get detailed analytics for a catalog link.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getCatalogLinkAnalytics } from '@/lib/services/catalogLinkService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required');
    }

    const { id } = await params;
    const analytics = await getCatalogLinkAnalytics(id);

    return Response.json(analytics);
  } catch (error) {
    return handleApiError(error);
  }
}

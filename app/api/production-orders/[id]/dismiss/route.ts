import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { dismissCompletedOrder } from '@/lib/services/productionService';
import { handleApiError } from '@/lib/utils/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN and PRODUCTION can dismiss completed orders
    if (!['ADMIN', 'PRODUCTION'].includes(session.user.role)) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;

    await dismissCompletedOrder(id, session.user.id);

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}


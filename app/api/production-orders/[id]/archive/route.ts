import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { archiveBlockedOrder } from '@/lib/services/productionService';
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

    // Only ADMIN and PRODUCTION can archive blocked orders
    if (!['ADMIN', 'PRODUCTION'].includes(session.user.role)) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { reason } = body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Archive reason is required' },
        { status: 400 }
      );
    }

    await archiveBlockedOrder(id, reason, session.user.id);

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}


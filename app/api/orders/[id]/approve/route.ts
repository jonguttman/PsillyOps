// API Route: Approve Order
// STRICT LAYERING: Validate → Check RBAC → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { approveOrder } from '@/lib/services/orderService';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Validate authentication
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // 2. Check RBAC permission
    if (!hasPermission(session.user.role as UserRole, 'orders', 'approve')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'You do not have permission to approve orders' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // 3. Call Service
    await approveOrder(id, session.user.id);

    // 4. Return JSON
    return Response.json({ success: true, message: 'Order approved successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}


// API Route: Ship Order
// STRICT LAYERING: Validate → Check RBAC → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { shipOrder } from '@/lib/services/orderService';
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
    if (!hasPermission(session.user.role as UserRole, 'orders', 'ship')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'You do not have permission to ship orders' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // 3. Parse optional tracking number from body
    let trackingNumber: string | undefined;
    try {
      const body = await req.json();
      trackingNumber = body.trackingNumber;
    } catch {
      // No body or invalid JSON is fine - tracking number is optional
    }

    // 4. Call Service
    await shipOrder({
      orderId: id,
      trackingNumber,
      userId: session.user.id,
    });

    // 5. Return JSON
    return Response.json({ success: true, message: 'Order shipped successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}


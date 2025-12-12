// API Route: Adjust Inventory
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { adjustInventory } from '@/lib/services/inventoryService';
import { handleApiError } from '@/lib/utils/errors';
import { adjustInventorySchema } from '@/lib/utils/validators';
import { hasPermission } from '@/lib/auth/rbac';

export async function POST(req: NextRequest) {
  try {
    // 1. Validate
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!hasPermission(session.user.role, 'inventory', 'adjust')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = adjustInventorySchema.parse(body);

    // 2. Call Service
    await adjustInventory({
      inventoryId: validated.inventoryId,
      deltaQuantity: validated.deltaQuantity,
      reason: validated.reason,
      userId: session.user.id
    });

    // 3. Return JSON
    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}



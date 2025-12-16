// API Route: Move Inventory
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { moveInventory } from '@/lib/services/inventoryService';
import { handleApiError } from '@/lib/utils/errors';
import { moveInventorySchema } from '@/lib/utils/validators';
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

    if (!hasPermission(session.user.role, 'inventory', 'move')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = moveInventorySchema.parse(body);

    // 2. Call Service
    await moveInventory({
      inventoryId: validated.inventoryId,
      toLocationId: validated.toLocationId,
      quantity: validated.quantity,
      reason: validated.reason,
      userId: session.user.id
    });

    // 3. Return JSON
    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}





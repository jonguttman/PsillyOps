// API Route: Inventory List
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getInventoryList } from '@/lib/services/inventoryService';
import { handleApiError } from '@/lib/utils/errors';
import { inventoryListFilterSchema } from '@/lib/utils/validators';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(req: NextRequest) {
  try {
    // 1. Validate
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!hasPermission(session.user.role, 'inventory', 'view')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams;
    const filter = {
      type: searchParams.get('type') || undefined,
      locationId: searchParams.get('locationId') || undefined,
      productId: searchParams.get('productId') || undefined,
      materialId: searchParams.get('materialId') || undefined,
      batchId: searchParams.get('batchId') || undefined,
      status: searchParams.get('status') || undefined,
      search: searchParams.get('search') || undefined,
      hasExpiry: searchParams.get('hasExpiry') === 'true' ? true : undefined,
      expiringWithinDays: searchParams.get('expiringWithinDays') 
        ? parseInt(searchParams.get('expiringWithinDays')!) 
        : undefined,
      limit: searchParams.get('limit') 
        ? parseInt(searchParams.get('limit')!) 
        : undefined,
      offset: searchParams.get('offset') 
        ? parseInt(searchParams.get('offset')!) 
        : undefined
    };

    const validated = inventoryListFilterSchema.parse(filter);

    // 2. Call Service
    const result = await getInventoryList(validated);

    // 3. Return JSON
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// API Route: Issue Materials for Production Order
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { issueMaterials } from '@/lib/services/productionService';
import { handleApiError } from '@/lib/utils/errors';
import { issueMaterialsSchema } from '@/lib/utils/validators';
import { hasPermission } from '@/lib/auth/rbac';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Validate
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!hasPermission(session.user.role, 'production', 'issueMaterials')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = issueMaterialsSchema.parse(body);

    // 2. Call Service
    const result = await issueMaterials(
      params.id,
      validated.materials,
      session.user.id
    );

    // 3. Return JSON
    return Response.json({ success: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}

// API Route: Work Centers List & Create
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { listWorkCenters, createWorkCenter } from '@/lib/services/workCenterService';
import { handleApiError } from '@/lib/utils/errors';
import { createWorkCenterSchema } from '@/lib/utils/validators';
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

    if (!hasPermission(session.user.role, 'workCenters', 'view')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true';

    // 2. Call Service
    const workCenters = await listWorkCenters(includeInactive);

    // 3. Return JSON
    return Response.json({ workCenters });
  } catch (error) {
    return handleApiError(error);
  }
}

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

    if (!hasPermission(session.user.role, 'workCenters', 'create')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = createWorkCenterSchema.parse(body);

    // 2. Call Service
    const workCenterId = await createWorkCenter({
      name: validated.name,
      description: validated.description,
      userId: session.user.id
    });

    // 3. Return JSON
    return Response.json({ success: true, workCenterId }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

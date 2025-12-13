// API Route: Activate Label Version
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { activateVersion, deactivateVersion } from '@/lib/services/labelService';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Validate auth
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!hasPermission(session.user.role, 'inventory', 'manage')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id: versionId } = await params;

    // Parse body for activate/deactivate action
    let activate = true;
    try {
      const body = await req.json();
      if (body.activate === false) {
        activate = false;
      }
    } catch {
      // If no body, default to activate
    }

    // 2. Call Service
    const version = activate
      ? await activateVersion(versionId, session.user.id)
      : await deactivateVersion(versionId, session.user.id);

    // 3. Return JSON
    return Response.json({ version });
  } catch (error) {
    return handleApiError(error);
  }
}


// API Route: Mark paper as used for a print job

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { markPaperUsed } from '@/lib/services/printJobService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const { id: printJobId } = await params;
    const body = await req.json();
    const { sheetsUsed } = body as { sheetsUsed?: number };

    const printJob = await markPaperUsed(
      printJobId,
      sheetsUsed,
      session.user.id
    );

    return Response.json({
      success: true,
      printJob
    });
  } catch (error) {
    return handleApiError(error);
  }
}


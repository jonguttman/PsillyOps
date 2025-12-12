// API Route: Batch QC Status
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { setBatchQCStatus } from '@/lib/services/productionService';
import { handleApiError } from '@/lib/utils/errors';
import { setBatchQCStatusSchema } from '@/lib/utils/validators';
import { hasPermission } from '@/lib/auth/rbac';
import { QCStatus } from '@prisma/client';

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

    if (!hasPermission(session.user.role, 'batches', 'qc')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = setBatchQCStatusSchema.parse(body);

    // 2. Call Service
    await setBatchQCStatus(
      params.id,
      validated.qcStatus as QCStatus,
      session.user.id,
      validated.notes
    );

    // 3. Return JSON
    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

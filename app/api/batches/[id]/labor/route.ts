// API Route: Batch Labor Entries
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getLaborEntries, addLaborEntry } from '@/lib/services/productionService';
import { handleApiError } from '@/lib/utils/errors';
import { addLaborEntrySchema } from '@/lib/utils/validators';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    if (!hasPermission(session.user.role, 'batches', 'view')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // 2. Call Service
    const result = await getLaborEntries(id);

    // 3. Return JSON
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    if (!hasPermission(session.user.role, 'batches', 'labor')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const validated = addLaborEntrySchema.parse(body);

    // 2. Call Service
    const entryId = await addLaborEntry({
      batchId: id,
      userId: validated.userId,
      minutes: validated.minutes,
      role: validated.role,
      notes: validated.notes,
      loggedByUserId: session.user.id
    });

    // 3. Return JSON
    return Response.json({ success: true, entryId }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

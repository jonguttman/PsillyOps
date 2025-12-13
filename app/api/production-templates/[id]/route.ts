// API Route: Production Template Detail, Update & Archive
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getProductionTemplate, updateProductionTemplate, archiveProductionTemplate } from '@/lib/services/productionTemplateService';
import { handleApiError } from '@/lib/utils/errors';
import { updateProductionTemplateSchema } from '@/lib/utils/validators';
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

    if (!hasPermission(session.user.role, 'templates', 'view')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // 2. Call Service
    const template = await getProductionTemplate(id);

    // 3. Return JSON
    return Response.json(template);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
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

    if (!hasPermission(session.user.role, 'templates', 'update')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const validated = updateProductionTemplateSchema.parse(body);

    // 2. Call Service
    await updateProductionTemplate(id, validated, session.user.id);

    // 3. Return JSON
    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
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

    if (!hasPermission(session.user.role, 'templates', 'delete')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // 2. Call Service (soft delete/archive)
    await archiveProductionTemplate(id, session.user.id);

    // 3. Return JSON
    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

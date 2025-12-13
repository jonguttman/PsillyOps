// API Route: Label Templates List & Create
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { listTemplates, createTemplate } from '@/lib/services/labelService';
import { handleApiError } from '@/lib/utils/errors';
import { createLabelTemplateSchema } from '@/lib/utils/validators';
import { hasPermission } from '@/lib/auth/rbac';
import { LabelEntityType } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    // 1. Validate auth
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
    const entityType = searchParams.get('entityType') as LabelEntityType | null;

    // 2. Call Service
    const templates = await listTemplates(entityType || undefined);

    // 3. Return JSON
    return Response.json({ templates });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
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

    // Parse and validate body
    const body = await req.json();
    const validated = createLabelTemplateSchema.parse(body);

    // 2. Call Service
    const template = await createTemplate({
      name: validated.name,
      entityType: validated.entityType as LabelEntityType,
      userId: session.user.id
    });

    // 3. Return JSON
    return Response.json({ template }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}


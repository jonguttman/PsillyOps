// API Route: Production Templates List & Create
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { listProductionTemplates, createProductionTemplate } from '@/lib/services/productionTemplateService';
import { handleApiError } from '@/lib/utils/errors';
import { createProductionTemplateSchema } from '@/lib/utils/validators';
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

    if (!hasPermission(session.user.role, 'templates', 'view')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const productId = req.nextUrl.searchParams.get('productId') || undefined;
    const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true';

    // 2. Call Service
    const templates = await listProductionTemplates({ productId, includeInactive });

    // 3. Return JSON
    return Response.json({ templates });
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

    if (!hasPermission(session.user.role, 'templates', 'create')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = createProductionTemplateSchema.parse(body);

    // 2. Call Service
    const templateId = await createProductionTemplate({
      name: validated.name,
      productId: validated.productId,
      defaultBatchSize: validated.defaultBatchSize,
      instructions: validated.instructions,
      userId: session.user.id
    });

    // 3. Return JSON
    return Response.json({ success: true, templateId }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

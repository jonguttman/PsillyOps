// STRAINS API - List and Create
// GET /api/strains - List all strains
// POST /api/strains - Create new strain (ADMIN only)

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { listStrains, createStrain } from '@/lib/services/strainService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // All authenticated users can view strains
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const search = searchParams.get('search') || undefined;

    const strains = await listStrains({ includeInactive, search });

    return Response.json(strains);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN can create strains
    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Only administrators can create strains' },
        { status: 403 }
      );
    }

    const body = await req.json();
    
    // Validate required fields
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Strain name is required' },
        { status: 400 }
      );
    }

    if (!body.shortCode || typeof body.shortCode !== 'string' || body.shortCode.trim().length === 0) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Short code is required' },
        { status: 400 }
      );
    }

    // Validate shortCode format (alphanumeric only)
    if (!/^[A-Za-z0-9]+$/.test(body.shortCode.trim())) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Short code must be alphanumeric' },
        { status: 400 }
      );
    }

    const strain = await createStrain({
      name: body.name.trim(),
      shortCode: body.shortCode.trim(),
      aliases: Array.isArray(body.aliases) ? body.aliases : []
    }, session.user.id);

    return Response.json(strain, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}


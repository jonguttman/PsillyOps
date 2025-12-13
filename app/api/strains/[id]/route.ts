// STRAIN API - Get, Update, Archive
// GET /api/strains/[id] - Get strain details
// PATCH /api/strains/[id] - Update strain (ADMIN only)
// DELETE /api/strains/[id] - Archive strain (ADMIN only)

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getStrain, updateStrain, archiveStrain } from '@/lib/services/strainService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';

export async function GET(
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

    const { id } = await params;
    const strain = await getStrain(id);

    return Response.json(strain);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
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

    // Only ADMIN can update strains
    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Only administrators can update strains' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    // Validate name if provided
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return Response.json(
          { code: 'VALIDATION_ERROR', message: 'Strain name cannot be empty' },
          { status: 400 }
        );
      }
    }

    // Validate shortCode if provided
    if (body.shortCode !== undefined) {
      if (typeof body.shortCode !== 'string' || body.shortCode.trim().length === 0) {
        return Response.json(
          { code: 'VALIDATION_ERROR', message: 'Short code cannot be empty' },
          { status: 400 }
        );
      }
      if (!/^[A-Za-z0-9]+$/.test(body.shortCode.trim())) {
        return Response.json(
          { code: 'VALIDATION_ERROR', message: 'Short code must be alphanumeric' },
          { status: 400 }
        );
      }
    }

    const strain = await updateStrain(id, {
      name: body.name?.trim(),
      shortCode: body.shortCode?.trim(),
      aliases: Array.isArray(body.aliases) ? body.aliases : undefined
    }, session.user.id);

    return Response.json(strain);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
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

    // Only ADMIN can archive strains
    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Only administrators can archive strains' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === 'true';

    const strain = await archiveStrain(id, session.user.id, force);

    return Response.json({ 
      success: true, 
      message: `Strain "${strain.name}" has been archived` 
    });
  } catch (error) {
    return handleApiError(error);
  }
}


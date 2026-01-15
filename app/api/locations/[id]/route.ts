// API Route: Single Location Management
// GET, PUT, DELETE operations for a specific location

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/utils/errors';
import {
  updateLocation,
  deactivateLocation,
  getLocationPath,
} from '@/lib/services/locationService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/locations/[id] - Get single location
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Check permission
    if (!['ADMIN', 'WAREHOUSE', 'PRODUCTION'].includes(session.user.role)) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        parent: {
          select: { id: true, name: true, type: true },
        },
        children: {
          where: { active: true },
          select: { id: true, name: true, type: true },
        },
        _count: {
          select: { inventory: true },
        },
      },
    });

    if (!location) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Location not found' },
        { status: 404 }
      );
    }

    // Add path
    const path = await getLocationPath(location.id);

    return Response.json({ ...location, path });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT /api/locations/[id] - Update location
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN can update locations
    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Only administrators can manage locations' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { name, type, parentId, isDefaultReceiving, isDefaultShipping, active } = body;

    // Use service layer for update with hierarchy validation
    const location = await updateLocation(
      id,
      {
        name,
        type,
        parentId,
        isDefaultReceiving,
        isDefaultShipping,
        active,
      },
      session.user.id,
      session.user.role === 'ADMIN'
    );

    // Fetch the full location with relations for response
    const fullLocation = await prisma.location.findUnique({
      where: { id: location.id },
      include: {
        parent: {
          select: { id: true, name: true, type: true },
        },
        children: {
          where: { active: true },
          select: { id: true, name: true, type: true },
        },
        _count: {
          select: { inventory: true },
        },
      },
    });

    // Add path
    const path = fullLocation ? await getLocationPath(fullLocation.id) : '';

    return Response.json({ ...fullLocation, path });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/locations/[id] - Soft delete location
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN can delete locations
    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Only administrators can manage locations' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Use service layer for deactivation with safety checks
    const result = await deactivateLocation(id, session.user.id);

    return Response.json({ ...result, softDeleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}

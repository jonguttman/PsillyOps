// API Route: Single Location Management
// GET, PUT, DELETE operations for a specific location

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { LOCATION_TYPES } from '../route';

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

    return Response.json(location);
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
    const { name, type, isDefaultReceiving, isDefaultShipping, active } = body;

    // Check location exists
    const existing = await prisma.location.findUnique({
      where: { id },
    });

    if (!existing) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Location not found' },
        { status: 404 }
      );
    }

    // Validate name if provided
    if (name !== undefined) {
      if (!name || !name.trim()) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Location name cannot be empty');
      }

      // Check for duplicate name (excluding current)
      const duplicate = await prisma.location.findFirst({
        where: {
          name: name.trim(),
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'A location with this name already exists');
      }
    }

    // Validate type if provided
    if (type !== undefined) {
      const validTypes = LOCATION_TYPES.map(t => t.value);
      if (!validTypes.includes(type)) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, `Invalid location type. Must be one of: ${validTypes.join(', ')}`);
      }
    }

    // If setting as default receiving, unset any existing default
    if (isDefaultReceiving === true) {
      await prisma.location.updateMany({
        where: { isDefaultReceiving: true, id: { not: id } },
        data: { isDefaultReceiving: false },
      });
    }

    // If setting as default shipping, unset any existing default
    if (isDefaultShipping === true) {
      await prisma.location.updateMany({
        where: { isDefaultShipping: true, id: { not: id } },
        data: { isDefaultShipping: false },
      });
    }

    const location = await prisma.location.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(type !== undefined && { type }),
        ...(isDefaultReceiving !== undefined && { isDefaultReceiving }),
        ...(isDefaultShipping !== undefined && { isDefaultShipping }),
        ...(active !== undefined && { active }),
      },
    });

    return Response.json(location);
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

    // Check location exists
    const existing = await prisma.location.findUnique({
      where: { id },
      include: {
        _count: {
          select: { inventory: true },
        },
      },
    });

    if (!existing) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Location not found' },
        { status: 404 }
      );
    }

    // Warn if location has inventory
    if (existing._count.inventory > 0) {
      // Soft delete - just mark as inactive
      await prisma.location.update({
        where: { id },
        data: { 
          active: false,
          // Clear defaults if this was a default
          isDefaultReceiving: false,
          isDefaultShipping: false,
        },
      });

      return Response.json({ 
        success: true, 
        message: `Location deactivated. ${existing._count.inventory} inventory items remain at this location.`,
        softDeleted: true,
      });
    }

    // If no inventory, we can still soft delete (safer)
    await prisma.location.update({
      where: { id },
      data: { 
        active: false,
        isDefaultReceiving: false,
        isDefaultShipping: false,
      },
    });

    return Response.json({ success: true, softDeleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}


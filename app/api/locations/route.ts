// API Route: Locations Management
// CRUD operations for storage locations (shelves, racks, bins, etc.)

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';

// Location types
export const LOCATION_TYPES = [
  { value: 'RACK', label: 'Rack' },
  { value: 'SHELF', label: 'Shelf' },
  { value: 'BIN', label: 'Bin' },
  { value: 'COLD_STORAGE', label: 'Cold Storage' },
  { value: 'PRODUCTION', label: 'Production Area' },
  { value: 'SHIPPING_RECEIVING', label: 'Shipping/Receiving' },
] as const;

// GET /api/locations - List all locations
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Check permission - ADMIN, WAREHOUSE, PRODUCTION can view
    if (!['ADMIN', 'WAREHOUSE', 'PRODUCTION'].includes(session.user.role)) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const activeOnly = searchParams.get('active') !== 'false';

    const locations = await prisma.location.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { inventory: true },
        },
      },
    });

    return Response.json(locations);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/locations - Create new location
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN can create locations
    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Only administrators can manage locations' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, type, isDefaultReceiving, isDefaultShipping } = body;

    // Validate required fields
    if (!name || !name.trim()) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Location name is required');
    }

    if (!type) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Location type is required');
    }

    // Validate type is valid
    const validTypes = LOCATION_TYPES.map(t => t.value);
    if (!validTypes.includes(type)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Invalid location type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Check for duplicate name
    const existing = await prisma.location.findUnique({
      where: { name: name.trim() },
    });

    if (existing) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'A location with this name already exists');
    }

    // If setting as default receiving, unset any existing default
    if (isDefaultReceiving) {
      await prisma.location.updateMany({
        where: { isDefaultReceiving: true },
        data: { isDefaultReceiving: false },
      });
    }

    // If setting as default shipping, unset any existing default
    if (isDefaultShipping) {
      await prisma.location.updateMany({
        where: { isDefaultShipping: true },
        data: { isDefaultShipping: false },
      });
    }

    const location = await prisma.location.create({
      data: {
        name: name.trim(),
        type,
        isDefaultReceiving: isDefaultReceiving || false,
        isDefaultShipping: isDefaultShipping || false,
        active: true,
      },
    });

    // Log location creation
    await logAction({
      entityType: ActivityEntity.LOCATION,
      entityId: location.id,
      action: 'location_created',
      userId: session.user.id,
      summary: `Location "${location.name}" created`,
      after: {
        name: location.name,
        type: location.type,
        isDefaultReceiving: location.isDefaultReceiving,
        isDefaultShipping: location.isDefaultShipping,
      },
      tags: ['location', 'created'],
    });

    return Response.json(location, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}


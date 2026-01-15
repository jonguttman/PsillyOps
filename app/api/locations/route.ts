// API Route: Locations Management
// CRUD operations for storage locations (shelves, racks, bins, etc.)

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/utils/errors';
import {
  createLocation,
  getPotentialParents,
  getLocationPath,
} from '@/lib/services/locationService';

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
    const forParentType = searchParams.get('forParentType'); // Get potential parents for a type

    // If requesting potential parents for a type
    if (forParentType) {
      const parents = await getPotentialParents(forParentType);
      return Response.json(parents);
    }

    const locations = await prisma.location.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
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

    // Add path to each location
    const locationsWithPath = await Promise.all(
      locations.map(async (loc) => ({
        ...loc,
        path: await getLocationPath(loc.id),
      }))
    );

    return Response.json(locationsWithPath);
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
    const { name, type, parentId, isDefaultReceiving, isDefaultShipping } = body;

    // Use service layer for creation with hierarchy validation
    const location = await createLocation(
      {
        name,
        type,
        parentId,
        isDefaultReceiving,
        isDefaultShipping,
      },
      session.user.id
    );

    // Fetch the full location with relations for response
    const fullLocation = await prisma.location.findUnique({
      where: { id: location.id },
      include: {
        parent: {
          select: { id: true, name: true, type: true },
        },
        _count: {
          select: { inventory: true },
        },
      },
    });

    return Response.json(fullLocation, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

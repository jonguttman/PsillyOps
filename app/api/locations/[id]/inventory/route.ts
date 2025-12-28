// API Route: Location Inventory
// Thin route - fetches inventory items for a specific location

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/locations/[id]/inventory - Get inventory items at a location
export async function GET(req: NextRequest, { params }: RouteParams) {
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

    const { id } = await params;

    // Verify location exists and is active
    const location = await prisma.location.findUnique({
      where: { id },
      select: { id: true, active: true, name: true },
    });

    if (!location) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Location not found' },
        { status: 404 }
      );
    }

    if (!location.active) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Cannot view inventory for inactive location' },
        { status: 403 }
      );
    }

    // Fetch inventory items - reusing pattern from inventoryService.getInventoryList
    const items = await prisma.inventoryItem.findMany({
      where: { locationId: id },
      include: {
        product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
        material: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
        batch: { select: { id: true, batchCode: true, status: true } },
      },
      orderBy: [
        { type: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Transform to consistent response format
    const inventory = items.map((item) => ({
      id: item.id,
      type: item.type,
      itemId: item.productId || item.materialId,
      itemName: item.product?.name || item.material?.name || 'Unknown',
      sku: item.product?.sku || item.material?.sku || '',
      unit: item.product?.unitOfMeasure || item.material?.unitOfMeasure || 'unit',
      quantityOnHand: item.quantityOnHand,
      quantityReserved: item.quantityReserved,
      quantityAvailable: item.quantityOnHand - item.quantityReserved,
      status: item.status,
      lotNumber: item.lotNumber,
      expiryDate: item.expiryDate?.toISOString() || null,
      batchCode: item.batch?.batchCode || null,
    }));

    return Response.json({
      locationId: id,
      locationName: location.name,
      items: inventory,
      count: inventory.length,
    });
  } catch (error) {
    console.error('Error fetching location inventory:', error);
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch inventory' },
      { status: 500 }
    );
  }
}


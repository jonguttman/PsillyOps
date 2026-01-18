/**
 * My Requests API
 *
 * Fetches catalog requests by IDs (stored in retailer's localStorage).
 * Validates that requests belong to the specified catalog.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const body = await request.json();
    const { requestIds } = body;

    if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      return NextResponse.json(
        { error: 'requestIds array is required' },
        { status: 400 }
      );
    }

    // Get catalog link by token
    const catalogLink = await prisma.catalogLink.findUnique({
      where: { token },
      select: { id: true }
    });

    if (!catalogLink) {
      return NextResponse.json(
        { error: 'Catalog not found' },
        { status: 404 }
      );
    }

    // Fetch requests that match the IDs AND belong to this catalog
    const requests = await prisma.catalogRequest.findMany({
      where: {
        id: { in: requestIds },
        catalogLinkId: catalogLink.id
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                imageUrl: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Serialize dates
    const serializedRequests = requests.map(r => ({
      id: r.id,
      status: r.status,
      contactName: r.contactName,
      contactEmail: r.contactEmail,
      contactPhone: r.contactPhone,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
      items: r.items.map(item => ({
        id: item.id,
        itemType: item.itemType,
        quantity: item.quantity,
        sampleReason: item.sampleReason,
        product: item.product
      }))
    }));

    return NextResponse.json({ requests: serializedRequests });
  } catch (error) {
    console.error('Error fetching my requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch requests' },
      { status: 500 }
    );
  }
}

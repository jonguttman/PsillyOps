// API Route: Orders List and Create
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { createOrder } from '@/lib/services/orderService';
import { handleApiError } from '@/lib/utils/errors';
import { createOrderSchema } from '@/lib/utils/validators';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const retailerId = searchParams.get('retailerId');
    
    const where: any = {};
    if (status) where.status = status;
    if (retailerId) where.retailerId = retailerId;
    
    // Reps can only see their own retailer orders
    if (session.user.role === 'REP') {
      const userRetailers = await prisma.retailer.findMany({
        where: { salesRepId: session.user.id },
        select: { id: true }
      });
      where.retailerId = { in: userRetailers.map(r => r.id) };
    }

    const orders = await prisma.retailerOrder.findMany({
      where,
      include: {
        retailer: true,
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        lineItems: {
          include: {
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return Response.json(orders);
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

    const body = await req.json();
    const validated = createOrderSchema.parse(body);

    // 2. Call Service
    const orderId = await createOrder({
      retailerId: validated.retailerId,
      createdByUserId: session.user.id,
      requestedShipDate: validated.requestedShipDate,
      lineItems: validated.lineItems
    });

    const order = await prisma.retailerOrder.findUnique({
      where: { id: orderId },
      include: {
        retailer: true,
        lineItems: {
          include: {
            product: true
          }
        }
      }
    });

    // 3. Return JSON
    return Response.json(order, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}



/**
 * POST /api/ops/retailers
 *
 * Create a new retailer.
 * REPs can only create retailers assigned to themselves.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const CreateRetailerSchema = z.object({
  name: z.string().min(1, 'Business name is required'),
  contactPhone: z.string().min(1, 'Phone is required'),
  contactEmail: z.string().email().optional().or(z.literal('')),
  shippingAddress: z.string().optional(),
  billingAddress: z.string().optional(),
  notes: z.string().optional(),
  salesRepId: z.string().optional()
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only ADMIN and REP can create retailers
    if (session.user.role !== 'ADMIN' && session.user.role !== 'REP') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = CreateRetailerSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, contactPhone, contactEmail, shippingAddress, billingAddress, notes, salesRepId } = parsed.data;

    // For REPs, automatically assign themselves as the sales rep
    // ADMINs can optionally specify a sales rep
    const assignedSalesRepId = session.user.role === 'REP'
      ? session.user.id
      : salesRepId || null;

    // Create the retailer
    const retailer = await prisma.retailer.create({
      data: {
        name,
        contactPhone,
        contactEmail: contactEmail || null,
        shippingAddress: shippingAddress || null,
        billingAddress: billingAddress || null,
        notes: notes || null,
        salesRepId: assignedSalesRepId,
        active: true
      },
      select: {
        id: true,
        name: true,
        contactPhone: true,
        contactEmail: true,
        shippingAddress: true,
        notes: true,
        salesRepId: true
      }
    });

    return Response.json(retailer, { status: 201 });
  } catch (error) {
    console.error('Create retailer error:', error);
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to create retailer' },
      { status: 500 }
    );
  }
}

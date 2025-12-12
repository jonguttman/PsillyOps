// API Route: List Invoices
// GET /api/invoices → List all invoices

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getInvoices, getOrdersAwaitingInvoice } from '@/lib/services/invoiceService';
import { handleApiError } from '@/lib/utils/errors';

export async function GET(req: NextRequest) {
  try {
    // 1. Validate auth
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const retailerId = searchParams.get('retailerId');
    const awaiting = searchParams.get('awaiting');

    // If awaiting=true, return orders awaiting invoice
    if (awaiting === 'true') {
      const orders = await getOrdersAwaitingInvoice();
      return Response.json(orders);
    }

    // Otherwise, return invoices with optional filters
    const invoices = await getInvoices({
      retailerId: retailerId || undefined,
      limit: 100
    });

    return Response.json(invoices);
  } catch (error) {
    return handleApiError(error);
  }
}



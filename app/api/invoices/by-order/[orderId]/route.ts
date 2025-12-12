// API Route: Generate Invoice for Order
// POST /api/invoices/by-order/[orderId] → Generate invoice for an order
// GET /api/invoices/by-order/[orderId] → Get invoice for an order

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { generateInvoice, getInvoiceByOrderId } from '@/lib/services/invoiceService';
import { handleApiError } from '@/lib/utils/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    // 1. Validate auth
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN can generate invoices
    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Only admins can generate invoices' },
        { status: 403 }
      );
    }

    const { orderId } = await params;
    const body = await req.json().catch(() => ({}));

    // 2. Generate invoice
    const invoiceId = await generateInvoice({
      orderId,
      notes: body.notes,
      userId: session.user.id
    });

    // 3. Fetch the created invoice
    const invoice = await getInvoiceByOrderId(orderId);

    return Response.json(invoice, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    // 1. Validate auth
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { orderId } = await params;

    // 2. Get invoice for order
    const invoice = await getInvoiceByOrderId(orderId);

    if (!invoice) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'No invoice found for this order' },
        { status: 404 }
      );
    }

    return Response.json(invoice);
  } catch (error) {
    return handleApiError(error);
  }
}



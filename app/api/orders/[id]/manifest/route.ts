// API Route: Download Order Manifest/Packing Slip PDF
// GET /api/orders/[id]/manifest → Download packing slip as PDF

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { generateManifestPdf } from '@/lib/services/invoiceService';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/utils/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;

    // 2. Get order to verify it exists and get order number for filename
    const order = await prisma.retailerOrder.findUnique({
      where: { id },
      select: { orderNumber: true }
    });

    if (!order) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Order not found' },
        { status: 404 }
      );
    }

    // 3. Generate PDF
    const pdfBuffer = await generateManifestPdf(id);

    // 4. Return PDF with proper headers
    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PackingSlip-${order.orderNumber}.pdf"`,
        'Content-Length': pdfBuffer.length.toString()
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}


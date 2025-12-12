// API Route: Download Invoice PDF
// GET /api/invoices/[id]/pdf → Download invoice as PDF

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { generateInvoicePdf, getInvoice } from '@/lib/services/invoiceService';
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

    // 2. Get invoice to verify it exists and get invoice number for filename
    const invoice = await getInvoice(id);
    if (!invoice) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Invoice not found' },
        { status: 404 }
      );
    }

    // 3. Generate PDF
    const pdfBuffer = await generateInvoicePdf(id);

    // 4. Return PDF with proper headers
    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.invoiceNo}.pdf"`,
        'Content-Length': pdfBuffer.length.toString()
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}


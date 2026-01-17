/**
 * POST /api/catalog/[token]/inquiry
 *
 * Submit an inquiry from the public catalog contact form.
 * No authentication required.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getCatalogLinkByToken,
  createInquiry
} from '@/lib/services/catalogLinkService';
import { handleApiError } from '@/lib/utils/errors';

const inquirySchema = z.object({
  contactName: z.string().min(1, 'Name is required').max(200),
  businessName: z.string().min(1, 'Business name is required').max(200),
  email: z.string().email('Invalid email address'),
  phone: z.string().max(50).optional(),
  followUpWith: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
  productsOfInterest: z.array(z.string()).optional()
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Validate token
    const catalogLink = await getCatalogLinkByToken(token);

    if (!catalogLink) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Catalog not found' },
        { status: 404 }
      );
    }

    if (catalogLink.status !== 'ACTIVE') {
      return Response.json(
        { code: 'INVALID_STATUS', message: 'This catalog is no longer available' },
        { status: 400 }
      );
    }

    // Check expiration
    if (catalogLink.expiresAt && catalogLink.expiresAt < new Date()) {
      return Response.json(
        { code: 'EXPIRED', message: 'This catalog has expired' },
        { status: 400 }
      );
    }

    // Parse and validate body
    const body = await req.json();
    const validated = inquirySchema.parse(body);

    // Get request metadata
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    // Create inquiry
    const inquiry = await createInquiry({
      catalogLinkId: catalogLink.id,
      ...validated,
      ipAddress: ip,
      userAgent
    });

    return Response.json(
      {
        success: true,
        inquiryId: inquiry.id,
        message: 'Inquiry submitted successfully'
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

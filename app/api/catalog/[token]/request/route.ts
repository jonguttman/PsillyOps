/**
 * POST /api/catalog/[token]/request
 *
 * Submit a quote/sample request from the public catalog.
 * No authentication required.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getCatalogLinkByToken,
  submitCatalogRequest
} from '@/lib/services/catalogLinkService';
import { handleApiError } from '@/lib/utils/errors';

// Valid sample purposes matching the Prisma enum
const samplePurposeEnum = z.enum([
  'EMPLOYEE_TRAINING',
  'CUSTOMER_SAMPLING',
  'STORE_DISPLAY',
  'PRODUCT_EVALUATION',
  'REPLACEMENT',
  'OTHER'
]);

const cartItemSchema = z.object({
  productId: z.string().min(1),
  itemType: z.enum(['QUOTE', 'SAMPLE']),
  quantity: z.number().int().min(1).max(1000),
  // Legacy field - kept for backward compatibility
  sampleReason: z.string().max(500).optional(),
  // New structured fields
  samplePurpose: samplePurposeEnum.optional(),
  samplePurposeNotes: z.string().max(500).optional()
});

const requestSchema = z.object({
  catalogLinkId: z.string().min(1),
  items: z.array(cartItemSchema).min(1, 'At least one item is required'),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().max(50).optional(),
  message: z.string().max(2000).optional()
}).refine(data => {
  // Validate that sample items have a purpose (or legacy reason for backward compatibility)
  return data.items.every(item => {
    if (item.itemType !== 'SAMPLE') return true;
    // New items should have samplePurpose, legacy items might have sampleReason
    return item.samplePurpose || (item.sampleReason && item.sampleReason.trim().length > 0);
  });
}, { message: 'Sample requests require a purpose' });

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
    const validated = requestSchema.parse(body);

    // Verify catalogLinkId matches
    if (validated.catalogLinkId !== catalogLink.id) {
      return Response.json(
        { code: 'INVALID_REQUEST', message: 'Catalog link mismatch' },
        { status: 400 }
      );
    }

    // Submit request
    const request = await submitCatalogRequest({
      catalogLinkId: catalogLink.id,
      items: validated.items,
      contactName: validated.contactName || undefined,
      contactEmail: validated.contactEmail || undefined,
      contactPhone: validated.contactPhone || undefined,
      message: validated.message || undefined
    });

    return Response.json(
      {
        success: true,
        requestId: request.id,
        message: 'Request submitted successfully'
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

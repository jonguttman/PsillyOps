/**
 * POST /api/catalog/[token]/renewal
 *
 * Submit a renewal request from the expired catalog landing page.
 * No authentication required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getExpiredCatalogInfo } from '@/lib/services/catalogLinkService';
import { createRenewalRequest } from '@/lib/services/renewalRequestService';
import { handleApiError } from '@/lib/utils/errors';

const renewalSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  store: z.string().min(1, 'Store is required').max(200),
  emailOrPhone: z.string().min(1, 'Email or phone is required').max(200),
  note: z.string().max(1000).optional()
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Get expired catalog info (returns null if token doesn't exist or isn't expired)
    const expiredInfo = await getExpiredCatalogInfo(token);

    if (!expiredInfo) {
      return new NextResponse(
        JSON.stringify({ code: 'NOT_FOUND', message: 'Catalog not found or not expired' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet'
          }
        }
      );
    }

    // Parse and validate body
    const body = await req.json();
    const validated = renewalSchema.parse(body);

    // Get request metadata
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    // Create renewal request
    const result = await createRenewalRequest({
      ...validated,
      sourceToken: token,
      retailerId: expiredInfo.retailerId || undefined,
      retailerName: expiredInfo.retailerName || undefined,
      ipAddress: ip,
      userAgent
    });

    return new NextResponse(
      JSON.stringify({
        success: true,
        requestId: result.id
      }),
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet'
        }
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

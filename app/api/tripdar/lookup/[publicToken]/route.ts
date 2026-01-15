/**
 * TripDAR Token Lookup Endpoint
 * 
 * GET /api/tripdar/lookup/{publicToken}
 * 
 * Called by Tripd.ar on every QR scan to:
 * - Validate token existence and status
 * - Fetch product/partner/batch info (safe fields only)
 * - Check if survey already submitted
 * - Increment scan analytics
 * 
 * Response Codes:
 * - 200: Token found and active/unbound
 * - 401: Missing or invalid API key
 * - 404: Token not found or invalid format
 * - 410: Token revoked or expired
 * 
 * SECURITY:
 * - Requires X-Tripdar-Key header
 * - Never returns internal IDs
 * - Rate limited by Tripd.ar (not enforced here)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireTripdarKey } from '@/lib/tripdar/auth';
import { validatePublicToken } from '@/lib/tripdar/token';
import { toTripdarLookupPayload } from '@/lib/tripdar/publicPayload';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ publicToken: string }> }
) {
  // 1. Validate API key
  const auth = requireTripdarKey(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401 }
    );
  }

  // 2. Extract and validate token format
  const { publicToken } = await params;
  const validation = validatePublicToken(publicToken);
  if (!validation.ok) {
    // Return 404 for format errors (don't reveal format rules)
    return NextResponse.json(
      { status: 'NOT_FOUND', message: 'Token not recognized' },
      { status: 404 }
    );
  }

  // 3. Find token in database
  const token = await prisma.tripdarToken.findUnique({
    where: { publicToken },
  });

  if (!token) {
    return NextResponse.json(
      { status: 'NOT_FOUND', message: 'Token not recognized' },
      { status: 404 }
    );
  }

  // 4. Check for revoked status
  if (token.status === 'REVOKED') {
    return NextResponse.json(
      {
        status: 'REVOKED',
        message: 'This seal has been revoked',
        reason: token.revokedReason ?? null,
      },
      { status: 410 }
    );
  }

  // 5. Check for expired status (dynamic check)
  const now = new Date();
  const isExpired = token.expiresAt && token.expiresAt.getTime() < now.getTime();
  
  if (token.status === 'EXPIRED' || isExpired) {
    return NextResponse.json(
      { status: 'EXPIRED', message: 'This seal has expired' },
      { status: 410 }
    );
  }

  // 6. Fetch bound entities (safe fields only) in parallel
  const [product, partner, batch, existingSurvey] = await Promise.all([
    token.productId
      ? prisma.product.findUnique({
          where: { id: token.productId },
          select: {
            name: true,
            sku: true,
            defaultExperienceMode: true,
          },
        })
      : Promise.resolve(null),
    token.partnerId
      ? prisma.partner.findUnique({
          where: { id: token.partnerId },
          select: {
            name: true,
            status: true,
          },
        })
      : Promise.resolve(null),
    token.batchId
      ? prisma.batch.findUnique({
          where: { id: token.batchId },
          select: {
            batchCode: true,
            productionDate: true,
          },
        })
      : Promise.resolve(null),
    // Check if survey already submitted for this token
    prisma.tripdarSurveyResponse.findFirst({
      where: { publicToken },
      select: { id: true },
    }),
  ]);

  // 7. Update scan analytics (best-effort, don't block response)
  prisma.tripdarToken
    .update({
      where: { id: token.id },
      data: {
        lastScannedAt: now,
        scanCount: { increment: 1 },
        // Auto-activate UNBOUND tokens on first scan
        activatedAt: token.activatedAt ?? now,
        status: token.status === 'UNBOUND' ? 'ACTIVE' : token.status,
      },
    })
    .catch((err) => {
      console.error('[tripdar/lookup] Failed to update scan analytics:', err);
    });

  // 8. Build and return public-safe payload
  const payload = toTripdarLookupPayload({
    token,
    product: product as Parameters<typeof toTripdarLookupPayload>[0]['product'],
    partner: partner as Parameters<typeof toTripdarLookupPayload>[0]['partner'],
    batch: batch as Parameters<typeof toTripdarLookupPayload>[0]['batch'],
    alreadySubmitted: Boolean(existingSurvey),
  });

  return NextResponse.json(payload, { status: 200 });
}


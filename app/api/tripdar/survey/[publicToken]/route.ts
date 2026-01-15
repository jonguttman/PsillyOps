/**
 * TripDAR Survey Submission Endpoint
 * 
 * POST /api/tripdar/survey/{publicToken}
 * 
 * Called by Tripd.ar when user submits experience survey.
 * 
 * Submission Rules:
 * - 1 submission per token (lifetime)
 * - Token must be ACTIVE or UNBOUND
 * - Fingerprint stored for abuse detection (optional)
 * 
 * Response Codes:
 * - 201: Survey submitted successfully
 * - 400: Invalid payload
 * - 401: Missing or invalid API key
 * - 404: Token not found
 * - 410: Token revoked or expired
 * - 429: Survey already submitted for this token
 * 
 * SECURITY:
 * - Requires X-Tripdar-Key header
 * - IP is hashed, not stored raw
 * - Fingerprint is optional client-provided hash
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireTripdarKey } from '@/lib/tripdar/auth';
import { validatePublicToken } from '@/lib/tripdar/token';
import { toSurveySuccessPayload, toSurveyErrorPayload } from '@/lib/tripdar/publicPayload';
import crypto from 'crypto';

/**
 * Hash IP address for privacy-conscious storage
 */
function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export async function POST(
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
    return NextResponse.json(
      toSurveyErrorPayload('Token not recognized'),
      { status: 404 }
    );
  }

  // 3. Find token in database
  const token = await prisma.tripdarToken.findUnique({
    where: { publicToken },
  });

  if (!token) {
    return NextResponse.json(
      toSurveyErrorPayload('Token not recognized'),
      { status: 404 }
    );
  }

  // 4. Enforce token status
  if (token.status === 'REVOKED') {
    return NextResponse.json(
      toSurveyErrorPayload('This seal has been revoked'),
      { status: 410 }
    );
  }

  const now = new Date();
  const isExpired = token.expiresAt && token.expiresAt.getTime() < now.getTime();
  
  if (token.status === 'EXPIRED' || isExpired) {
    return NextResponse.json(
      toSurveyErrorPayload('This seal has expired'),
      { status: 410 }
    );
  }

  // 5. Enforce 1 submission per token (lifetime)
  const existingSurvey = await prisma.tripdarSurveyResponse.findFirst({
    where: { publicToken },
    select: { id: true },
  });

  if (existingSurvey) {
    return NextResponse.json(
      toSurveyErrorPayload('Survey already submitted for this token'),
      { status: 429 }
    );
  }

  // 6. Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      toSurveyErrorPayload('Invalid JSON payload'),
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      toSurveyErrorPayload('Invalid payload'),
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;
  
  // Extract fields
  const experienceMode = typeof payload.experienceMode === 'string' 
    ? payload.experienceMode 
    : null;
  const responses = payload.responses;
  const fingerprint = typeof payload.deviceFingerprint === 'string' 
    ? payload.deviceFingerprint 
    : null;

  // Validate responses object exists
  if (!responses || typeof responses !== 'object') {
    return NextResponse.json(
      toSurveyErrorPayload('Missing responses'),
      { status: 400 }
    );
  }

  // 7. Get client IP for hashing
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    ?? req.headers.get('x-real-ip') 
    ?? null;
  const ipHash = hashIp(clientIp);

  // 8. Create survey response
  await prisma.tripdarSurveyResponse.create({
    data: {
      tokenId: token.id,
      publicToken,
      experienceMode,
      responses: responses as object,
      fingerprint,
      ipHash,
    },
  });

  // 9. Update token status if needed (best-effort)
  if (token.status === 'UNBOUND') {
    prisma.tripdarToken
      .update({
        where: { id: token.id },
        data: {
          status: 'ACTIVE',
          activatedAt: token.activatedAt ?? now,
        },
      })
      .catch((err) => {
        console.error('[tripdar/survey] Failed to update token status:', err);
      });
  }

  // 10. Get total responses for comparison (simple count for now)
  const totalResponses = await prisma.tripdarSurveyResponse.count({
    where: { publicToken },
  });

  return NextResponse.json(
    toSurveySuccessPayload(totalResponses),
    { status: 201 }
  );
}


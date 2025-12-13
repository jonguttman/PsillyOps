// API Route: QR Redirect Rules
// STRICT LAYERING: Validate → Call Service → Return JSON
// Create and list QR redirect rules for group-based redirects

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { createRedirectRule, listRedirectRules } from '@/lib/services/qrRedirectService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { LabelEntityType } from '@prisma/client';

const VALID_ENTITY_TYPES: LabelEntityType[] = ['PRODUCT', 'BATCH', 'INVENTORY', 'CUSTOM'];

/**
 * POST /api/qr-redirects
 * Create a new QR redirect rule
 * 
 * Body:
 * - entityType + entityId: Target a specific entity (e.g., all scans for product X)
 * - OR versionId: Target a label template version (all labels printed with that version)
 * - redirectUrl: Where to redirect matching scans (required)
 * - reason: Why this rule exists (optional)
 * - startsAt: When the rule becomes active (optional)
 * - endsAt: When the rule expires (optional)
 * 
 * Only ADMIN users can create redirect rules.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Validate auth - ADMIN only
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Only administrators can create redirect rules' },
        { status: 403 }
      );
    }

    // 2. Parse and validate input
    const body = await req.json();
    const { entityType, entityId, versionId, redirectUrl, reason, startsAt, endsAt } = body;

    // Validate entityType if provided
    if (entityType && !VALID_ENTITY_TYPES.includes(entityType)) {
      throw new AppError(
        ErrorCodes.INVALID_INPUT,
        `entityType must be one of: ${VALID_ENTITY_TYPES.join(', ')}`
      );
    }

    // Validate redirectUrl is provided
    if (!redirectUrl || typeof redirectUrl !== 'string') {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'redirectUrl is required');
    }

    // 3. Call service
    const rule = await createRedirectRule(
      {
        entityType,
        entityId,
        versionId,
        redirectUrl,
        reason,
        startsAt: startsAt ? new Date(startsAt) : undefined,
        endsAt: endsAt ? new Date(endsAt) : undefined
      },
      session.user.id
    );

    // 4. Return response
    return Response.json(rule, { status: 201 });

  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/qr-redirects
 * List QR redirect rules with optional filters
 * 
 * Query params:
 * - active: Filter by active status (true/false)
 * - entityType: Filter by entity type
 * - entityId: Filter by entity ID
 * - versionId: Filter by label version
 * - limit: Max results (default 50)
 * - offset: Pagination offset
 * 
 * Only ADMIN users can view redirect rules.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Validate auth - ADMIN only
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Only administrators can view redirect rules' },
        { status: 403 }
      );
    }

    // 2. Parse query params
    const searchParams = req.nextUrl.searchParams;
    const activeParam = searchParams.get('active');
    const entityType = searchParams.get('entityType') as LabelEntityType | null;
    const entityId = searchParams.get('entityId');
    const versionId = searchParams.get('versionId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // 3. Call service
    const result = await listRedirectRules({
      active: activeParam !== null ? activeParam === 'true' : undefined,
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      versionId: versionId || undefined,
      limit,
      offset
    });

    // 4. Return response
    return Response.json(result);

  } catch (error) {
    return handleApiError(error);
  }
}


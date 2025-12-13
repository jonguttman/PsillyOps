// API Route: Deactivate QR Redirect Rule
// STRICT LAYERING: Validate → Call Service → Return JSON
// Deactivates a redirect rule (does not delete for audit purposes)

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { deactivateRedirectRule, getRedirectRule } from '@/lib/services/qrRedirectService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/qr-redirects/[id]/deactivate
 * Deactivate a QR redirect rule
 * 
 * This endpoint deactivates a rule without deleting it, preserving the audit trail.
 * Once deactivated, the rule will no longer match QR scans.
 * 
 * Only ADMIN users can deactivate redirect rules.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

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
        { code: 'FORBIDDEN', message: 'Only administrators can deactivate redirect rules' },
        { status: 403 }
      );
    }

    // 2. Validate rule exists
    if (!id || typeof id !== 'string') {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Rule ID is required');
    }

    const existingRule = await getRedirectRule(id);
    if (!existingRule) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Redirect rule not found');
    }

    // 3. Call service
    const rule = await deactivateRedirectRule(id, session.user.id);

    // 4. Return response
    return Response.json({
      success: true,
      rule
    });

  } catch (error) {
    return handleApiError(error);
  }
}


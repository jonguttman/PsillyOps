// API Route: Resolve QR context from token or URL
// Used by AI Command Bar to inject QR context into prompts

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { getTokenByValue, getQRDetail, isValidTokenFormat } from '@/lib/services/qrTokenService';

/**
 * POST /api/qr-tokens/resolve-context
 * Resolve QR token/URL to context object for AI
 * 
 * Body:
 * - input: string (QR URL or token value)
 * 
 * Returns QR_CONTEXT object for AI prompt injection
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { input } = body;

    if (!input || typeof input !== 'string') {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'input is required');
    }

    // Extract token from URL or direct value
    let tokenValue: string | null = null;

    // Pattern: /qr/qr_[A-Za-z0-9]+
    const urlMatch = input.match(/\/qr\/(qr_[A-Za-z0-9]+)/);
    if (urlMatch) {
      tokenValue = urlMatch[1];
    } else if (isValidTokenFormat(input)) {
      tokenValue = input;
    } else {
      // Try to find a qr_ pattern anywhere in the input
      const tokenMatch = input.match(/qr_[A-Za-z0-9]{22}/);
      if (tokenMatch) {
        tokenValue = tokenMatch[0];
      }
    }

    if (!tokenValue) {
      return Response.json({
        found: false,
        message: 'No QR token found in input'
      });
    }

    // Look up token by value
    const token = await getTokenByValue(tokenValue);
    if (!token) {
      return Response.json({
        found: false,
        tokenValue,
        message: 'Token not found in database'
      });
    }

    // Get detailed info
    const detail = await getQRDetail(token.id);
    if (!detail) {
      return Response.json({
        found: false,
        tokenValue,
        message: 'Could not load token details'
      });
    }

    // Build QR_CONTEXT for AI
    const qrContext = {
      type: 'QR_CONTEXT',
      tokenId: token.id,
      tokenValue: token.token,
      entityType: token.entityType,
      entityId: token.entityId,
      entityName: detail.entityName,
      entityLink: detail.entityLink,
      labelVersion: detail.version ? `${detail.version.template?.name} v${detail.version.version}` : null,
      currentRedirect: {
        type: detail.effectiveRedirect.type,
        url: detail.effectiveRedirect.url,
        ruleName: detail.effectiveRedirect.ruleName
      },
      status: token.status,
      scanCount: token.scanCount,
      lastScanned: token.lastScannedAt
    };

    // Suggested actions based on context
    const suggestedActions = [
      { action: 'view_detail', label: 'View QR Details', link: `/qr/${token.id}` },
      { action: 'view_entity', label: `View ${token.entityType}`, link: detail.entityLink },
      { action: 'scan_history', label: 'View Scan History', link: `/qr/${token.id}?range=7d` }
    ];

    if (token.status === 'ACTIVE') {
      suggestedActions.push(
        { action: 'change_redirect', label: 'Change Redirect', link: `/qr/${token.id}#redirect` },
        { action: 'add_note', label: 'Add Note', link: `/qr/${token.id}#notes` }
      );
      
      if (session.user.role === 'ADMIN') {
        suggestedActions.push(
          { action: 'revoke', label: 'Revoke Token', link: `/qr/${token.id}#revoke` }
        );
      }
    }

    return Response.json({
      found: true,
      qrContext,
      suggestedActions,
      summary: `QR token for ${detail.entityName} (${token.entityType}). Status: ${token.status}. Scanned ${token.scanCount} times. Currently redirects via ${detail.effectiveRedirect.type} to ${detail.effectiveRedirect.url}`
    });

  } catch (error) {
    return handleApiError(error);
  }
}


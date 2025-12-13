// API Route: Get QR tokens for an entity
// Returns tokens with resolved destinations and scan histories

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { getTokensForEntity, getTokenStats } from '@/lib/services/qrTokenService';
import { findActiveRedirectRule } from '@/lib/services/qrRedirectService';
import { LabelEntityType } from '@prisma/client';

const VALID_ENTITY_TYPES = ['PRODUCT', 'BATCH', 'INVENTORY', 'CUSTOM'];

/**
 * GET /api/qr-tokens/for-entity
 * Get all tokens for an entity with resolved destinations
 * 
 * Query params:
 * - entityType: PRODUCT, BATCH, INVENTORY
 * - entityId: The entity ID
 * - status: Optional status filter (ACTIVE, REVOKED, EXPIRED)
 * - limit: Max results (default 50)
 * - offset: Pagination offset
 * 
 * Only ADMIN and PRODUCTION roles can view tokens.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Validate auth
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only ADMIN can view tokens
    if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE'].includes(session.user.role)) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // 2. Parse query params
    const searchParams = req.nextUrl.searchParams;
    const entityType = searchParams.get('entityType') as LabelEntityType | null;
    const entityId = searchParams.get('entityId');
    const status = searchParams.get('status') as 'ACTIVE' | 'REVOKED' | 'EXPIRED' | null;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Validate required params
    if (!entityType || !VALID_ENTITY_TYPES.includes(entityType)) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Valid entityType is required');
    }
    if (!entityId) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'entityId is required');
    }

    // 3. Fetch tokens and stats
    const [{ tokens, total }, stats] = await Promise.all([
      getTokensForEntity(entityType, entityId, { status: status || undefined, limit, offset }),
      getTokenStats(entityType, entityId)
    ]);

    // 4. Get active redirect rule for this entity
    const activeRule = await findActiveRedirectRule({
      entityType,
      entityId,
      versionId: undefined
    });

    // 5. Resolve destinations for each token
    const resolvedDestinations: Record<string, {
      type: 'TOKEN' | 'GROUP' | 'DEFAULT';
      url: string;
      ruleName?: string;
    }> = {};

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const defaultUrl = `${baseUrl}/qr/${entityType.toLowerCase()}/${entityId}`;

    for (const token of tokens) {
      if (token.redirectUrl) {
        // Token-level override
        resolvedDestinations[token.id] = {
          type: 'TOKEN',
          url: token.redirectUrl
        };
      } else if (activeRule) {
        // Group rule
        resolvedDestinations[token.id] = {
          type: 'GROUP',
          url: activeRule.redirectUrl,
          ruleName: activeRule.reason || 'Active redirect rule'
        };
      } else {
        // Default routing
        resolvedDestinations[token.id] = {
          type: 'DEFAULT',
          url: defaultUrl
        };
      }
    }

    // 6. Get scan histories from activity logs
    const scanHistories: Record<string, Array<{
      id: string;
      timestamp: string;
      resolutionType: string;
      destination: string;
    }>> = {};

    const tokenIds = tokens.map(t => t.id);
    if (tokenIds.length > 0) {
      const scanLogs = await prisma.activityLog.findMany({
        where: {
          entityId: { in: [entityId] },
          action: { contains: 'qr_token_scanned' }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      });

      for (const log of scanLogs) {
        const details = log.details as any;
        const tokenId = details?.tokenId;
        if (tokenId && tokenIds.includes(tokenId)) {
          if (!scanHistories[tokenId]) {
            scanHistories[tokenId] = [];
          }
          if (scanHistories[tokenId].length < 10) {
            scanHistories[tokenId].push({
              id: log.id,
              timestamp: log.createdAt.toISOString(),
              resolutionType: details?.resolutionType || 'DEFAULT',
              destination: details?.redirectUrl || details?.destination || ''
            });
          }
        }
      }
    }

    // 7. Format tokens with version info
    const formattedTokens = tokens.map(token => ({
      id: token.id,
      token: token.token,
      status: token.status,
      redirectUrl: token.redirectUrl,
      scanCount: token.scanCount,
      lastScannedAt: token.lastScannedAt?.toISOString() || null,
      printedAt: token.printedAt.toISOString(),
      versionId: token.versionId,
      versionNumber: token.version?.version
    }));

    return Response.json({
      tokens: formattedTokens,
      total,
      stats,
      resolvedDestinations,
      scanHistories,
      activeRule: activeRule ? {
        id: activeRule.id,
        redirectUrl: activeRule.redirectUrl,
        reason: activeRule.reason
      } : null
    });

  } catch (error) {
    return handleApiError(error);
  }
}


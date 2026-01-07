// API Route: Internal QR Token → Product Lookup
// STRICT LAYERING: Validate → Call Service → Return JSON
//
// Internal-only endpoint for Psilly Journal to resolve QR tokens to product info.
// Silently logs scan activity for analytics without triggering user-facing side effects.

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { isValidTokenFormat, getTokenByValue } from '@/lib/services/qrTokenService';
import { logAction } from '@/lib/services/loggingService';
import { handleApiError, ErrorCodes } from '@/lib/utils/errors';
import { ActivityEntity, LabelEntityType } from '@prisma/client';

interface InternalProductLookupResponse {
  product_id: string;
  name: string;
  description: string | null;
  batch_id?: string;
  token: string;
  entity_type: 'PRODUCT' | 'BATCH' | 'INVENTORY';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // 1. Validate authentication (session OR internal service token)
    const session = await auth();
    const authHeader = req.headers.get('authorization');
    const isInternalService = 
      process.env.INTERNAL_SERVICE_TOKEN && 
      authHeader === `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`;

    if (!session && !isInternalService) {
      return Response.json(
        { code: ErrorCodes.UNAUTHORIZED, message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { token: tokenValue } = await params;

    // 2. Validate token format
    if (!isValidTokenFormat(tokenValue)) {
      return Response.json(
        { code: ErrorCodes.QR_TOKEN_NOT_FOUND, message: 'Invalid QR token format' },
        { status: 404 }
      );
    }

    // 3. Fetch token record (read-only, no side effects)
    const token = await getTokenByValue(tokenValue);

    if (!token) {
      return Response.json(
        { code: ErrorCodes.QR_TOKEN_NOT_FOUND, message: 'QR token not found' },
        { status: 404 }
      );
    }

    // 4. Check token status
    const isExpired = token.expiresAt && token.expiresAt < new Date();
    if (token.status === 'REVOKED' || token.status === 'EXPIRED' || isExpired) {
      return Response.json(
        { 
          code: ErrorCodes.QR_TOKEN_INACTIVE, 
          message: token.status === 'REVOKED' 
            ? 'This QR token has been revoked' 
            : 'This QR token has expired'
        },
        { status: 410 }
      );
    }

    // 5. Resolve entity to product
    const resolved = await resolveToProduct(token.entityType, token.entityId);

    if (!resolved) {
      return Response.json(
        { code: ErrorCodes.QR_TOKEN_NOT_FOUND, message: 'Associated product not found' },
        { status: 404 }
      );
    }

    // 6. Increment scan count and update lastScannedAt (silent, no notifications)
    await prisma.qRToken.update({
      where: { id: token.id },
      data: {
        scanCount: { increment: 1 },
        lastScannedAt: new Date()
      }
    });

    // 7. Log internal scan event (silent analytics)
    await logAction({
      entityType: ActivityEntity.SYSTEM,
      entityId: token.id,
      action: 'qr_token_scanned_internal',
      userId: null, // System-originated, no user
      summary: `Internal QR scan from psilly-journal for ${token.entityType} ${token.entityId}`,
      metadata: {
        tokenId: token.id,
        tokenValue: tokenValue,
        entityType: token.entityType,
        entityId: token.entityId,
        productId: resolved.product.id,
        batchId: resolved.batchId,
        source: 'psilly-journal',
        scanCount: token.scanCount + 1,
      },
      tags: ['qr', 'scan', 'journal', 'internal']
    });

    // 8. Return minimal, journal-safe response
    const response: InternalProductLookupResponse = {
      product_id: resolved.product.id,
      name: resolved.product.name,
      description: resolved.product.description,
      token: tokenValue,
      entity_type: token.entityType as 'PRODUCT' | 'BATCH' | 'INVENTORY',
      ...(resolved.batchId && { batch_id: resolved.batchId })
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Resolve a QR token entity to its associated product
 */
async function resolveToProduct(
  entityType: LabelEntityType,
  entityId: string
): Promise<{ product: { id: string; name: string; description: string | null }; batchId?: string } | null> {
  switch (entityType) {
    case 'PRODUCT': {
      const product = await prisma.product.findUnique({
        where: { id: entityId },
        select: { id: true, name: true, description: true }
      });
      return product ? { product } : null;
    }

    case 'BATCH': {
      const batch = await prisma.batch.findUnique({
        where: { id: entityId },
        include: {
          product: {
            select: { id: true, name: true, description: true }
          }
        }
      });
      return batch ? { product: batch.product, batchId: batch.id } : null;
    }

    case 'INVENTORY': {
      const inventory = await prisma.inventoryItem.findUnique({
        where: { id: entityId },
        include: {
          product: {
            select: { id: true, name: true, description: true }
          },
          batch: {
            select: { id: true }
          }
        }
      });
      if (!inventory?.product) return null;
      return { 
        product: inventory.product, 
        batchId: inventory.batch?.id 
      };
    }

    default:
      return null;
  }
}


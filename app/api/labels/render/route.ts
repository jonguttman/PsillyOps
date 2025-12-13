// API Route: Render Label SVG with QR Code
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { 
  renderLabelSvg, 
  renderActiveLabelSvg, 
  logLabelPrinted,
  getBaseUrl,
  buildBatchQRPayload,
  buildProductQRPayload,
  buildInventoryQRPayload,
  QRPayload
} from '@/lib/services/labelService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db/prisma';
import { LabelEntityType } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    // 1. Validate auth
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!hasPermission(session.user.role, 'inventory', 'view')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { versionId, entityType, entityId, quantity = 1 } = body;

    if (!entityId) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'entityId is required');
    }

    if (!versionId && !entityType) {
      throw new AppError(
        ErrorCodes.INVALID_INPUT,
        'Either versionId or entityType is required'
      );
    }

    // Build QR payload based on entity type
    const baseUrl = getBaseUrl();
    let qrPayload: QRPayload;
    let entityCode: string;

    // Determine entity type from versionId if not provided
    let resolvedEntityType = entityType as LabelEntityType | undefined;
    
    if (!resolvedEntityType && versionId) {
      const version = await prisma.labelTemplateVersion.findUnique({
        where: { id: versionId },
        include: { template: true }
      });
      if (version) {
        resolvedEntityType = version.template.entityType;
      }
    }

    // Fetch entity and build QR payload
    switch (resolvedEntityType) {
      case 'BATCH': {
        const batch = await prisma.batch.findUnique({
          where: { id: entityId },
          include: { product: true }
        });
        if (!batch) {
          throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
        }
        qrPayload = buildBatchQRPayload(batch, baseUrl);
        entityCode = batch.batchCode;
        break;
      }
      
      case 'PRODUCT': {
        const product = await prisma.product.findUnique({
          where: { id: entityId }
        });
        if (!product) {
          throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
        }
        qrPayload = buildProductQRPayload(product, baseUrl);
        entityCode = product.sku;
        break;
      }
      
      case 'INVENTORY': {
        const inventory = await prisma.inventoryItem.findUnique({
          where: { id: entityId }
        });
        if (!inventory) {
          throw new AppError(ErrorCodes.NOT_FOUND, 'Inventory item not found');
        }
        qrPayload = buildInventoryQRPayload(inventory, baseUrl);
        entityCode = inventory.lotNumber || inventory.id.slice(-8);
        break;
      }
      
      default:
        throw new AppError(
          ErrorCodes.INVALID_INPUT,
          'Invalid or unsupported entity type'
        );
    }

    // 2. Call Service - Render SVG
    let svg: string | null;
    let usedVersionId = versionId;

    if (versionId) {
      svg = await renderLabelSvg({ versionId, qrPayload });
    } else {
      svg = await renderActiveLabelSvg(resolvedEntityType!, qrPayload);
      
      // Get the active version ID for logging
      const activeVersion = await prisma.labelTemplateVersion.findFirst({
        where: {
          template: { entityType: resolvedEntityType },
          isActive: true
        }
      });
      usedVersionId = activeVersion?.id;
    }

    if (!svg) {
      throw new AppError(
        ErrorCodes.NOT_FOUND,
        `No active label template found for ${resolvedEntityType}`
      );
    }

    // Log the print event
    if (usedVersionId) {
      await logLabelPrinted({
        versionId: usedVersionId,
        entityType: resolvedEntityType!,
        entityId,
        entityCode,
        quantity,
        userId: session.user.id
      });
    }

    // 3. Return SVG content
    // Return as JSON with SVG string for flexibility
    return Response.json({
      svg,
      entityType: resolvedEntityType,
      entityId,
      entityCode,
      quantity
    });
  } catch (error) {
    return handleApiError(error);
  }
}


// API Route: Render Labels with QR Tokens
// Creates tokens and renders labels in one operation
// STRICT LAYERING: Validate → Call Services → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { 
  renderLabelsWithTokens,
  getBaseUrl,
  getActiveLabelTemplate
} from '@/lib/services/labelService';
import { 
  createTokenBatch,
  buildTokenUrl
} from '@/lib/services/qrTokenService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db/prisma';
import { LabelEntityType } from '@prisma/client';

const VALID_ENTITY_TYPES: LabelEntityType[] = ['PRODUCT', 'BATCH', 'INVENTORY'];

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

    // 2. Parse and validate input
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

    const qty = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 100); // Cap at 100 for single request

    // Determine entity type and version
    let resolvedEntityType = entityType as LabelEntityType | undefined;
    let resolvedVersionId = versionId;

    if (!resolvedEntityType && versionId) {
      const version = await prisma.labelTemplateVersion.findUnique({
        where: { id: versionId },
        include: { template: true }
      });
      if (version) {
        resolvedEntityType = version.template.entityType;
      }
    }

    if (!resolvedEntityType || !VALID_ENTITY_TYPES.includes(resolvedEntityType)) {
      throw new AppError(
        ErrorCodes.INVALID_INPUT,
        'Invalid or unsupported entity type'
      );
    }

    // Get version ID if not provided (use active version)
    if (!resolvedVersionId) {
      const active = await getActiveLabelTemplate(resolvedEntityType);
      if (!active) {
        throw new AppError(
          ErrorCodes.NOT_FOUND,
          `No active label template found for ${resolvedEntityType}`
        );
      }
      resolvedVersionId = active.activeVersion.id;
    }

    // Get entity code for response
    let entityCode: string;
    switch (resolvedEntityType) {
      case 'BATCH': {
        const batch = await prisma.batch.findUnique({ where: { id: entityId } });
        if (!batch) throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
        entityCode = batch.batchCode;
        break;
      }
      case 'PRODUCT': {
        const product = await prisma.product.findUnique({ where: { id: entityId } });
        if (!product) throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
        entityCode = product.sku;
        break;
      }
      case 'INVENTORY': {
        const inventory = await prisma.inventoryItem.findUnique({ where: { id: entityId } });
        if (!inventory) throw new AppError(ErrorCodes.NOT_FOUND, 'Inventory item not found');
        entityCode = inventory.lotNumber || inventory.id.slice(-8);
        break;
      }
      default:
        throw new AppError(ErrorCodes.INVALID_INPUT, 'Invalid entity type');
    }

    // 3. Create tokens
    const baseUrl = getBaseUrl();
    const tokens = await createTokenBatch({
      entityType: resolvedEntityType,
      entityId,
      versionId: resolvedVersionId,
      quantity: qty,
      userId: session.user.id
    });

    // 4. Render labels with tokens
    const tokenStrings = tokens.map(t => t.token);
    const svgs = await renderLabelsWithTokens({
      versionId: resolvedVersionId,
      tokens: tokenStrings,
      baseUrl
    });

    // 5. Build response
    const labels = tokens.map((t, i) => ({
      tokenId: t.id,
      token: t.token,
      url: buildTokenUrl(t.token, baseUrl),
      svg: svgs[i]
    }));

    return Response.json({
      labels,
      entityType: resolvedEntityType,
      entityId,
      entityCode,
      quantity: labels.length,
      versionId: resolvedVersionId
    });

  } catch (error) {
    return handleApiError(error);
  }
}


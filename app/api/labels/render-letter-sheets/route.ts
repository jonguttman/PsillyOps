// API Route: Render Letter-Size Label Sheets with Token QR Codes
// Printing always uses token-based QR URLs: ${baseUrl}/qr/${token}
// One token is created per physical label instance. Sheets are composed at render time (no layout persisted).
// STRICT LAYERING: Validate → Call Services → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import {
  composeLetterSheetsFromLabelSvgs,
  getActiveLabelTemplate,
  getBaseUrl,
  renderLabelsShared
} from '@/lib/services/labelService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { LabelEntityType } from '@prisma/client';

const VALID_ENTITY_TYPES: LabelEntityType[] = ['PRODUCT', 'BATCH', 'INVENTORY'];

export async function POST(req: NextRequest) {
  try {
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
    const { versionId, entityType, entityId, quantity = 1 } = body as {
      versionId?: string;
      entityType: LabelEntityType;
      entityId: string;
      quantity: number;
    };

    if (!entityType || !VALID_ENTITY_TYPES.includes(entityType)) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Invalid or unsupported entityType');
    }
    if (!entityId) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'entityId is required');
    }

    const qty = Math.min(Math.max(parseInt(String(quantity), 10) || 1, 1), 1000);

    // Resolve version (active if omitted)
    let resolvedVersionId = versionId;
    if (!resolvedVersionId) {
      const active = await getActiveLabelTemplate(entityType);
      if (!active) {
        throw new AppError(
          ErrorCodes.NOT_FOUND,
          `No active label template found for ${entityType}`
        );
      }
      resolvedVersionId = active.activeVersion.id;
    }

    // Render labels in token mode (creates 1 token per physical label)
    const baseUrl = getBaseUrl();
    const rendered = await renderLabelsShared({
      mode: 'token',
      versionId: resolvedVersionId,
      entityType,
      entityId,
      quantity: qty,
      userId: session.user.id,
      baseUrl
    });

    const { sheets, meta } = composeLetterSheetsFromLabelSvgs({ labelSvgs: rendered.svgs });

    return Response.json({
      sheets,
      perSheet: meta.perSheet,
      columns: meta.columns,
      rows: meta.rows,
      rotationUsed: meta.rotationUsed,
      totalSheets: meta.totalSheets
    });
  } catch (error) {
    return handleApiError(error);
  }
}



/**
 * Single Catalog Link Admin API
 *
 * GET    /api/ops/catalog-links/[id] - Get catalog link details
 * PATCH  /api/ops/catalog-links/[id] - Update catalog link
 * DELETE /api/ops/catalog-links/[id] - Revoke catalog link
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/auth';
import {
  getCatalogLink,
  updateCatalogLink,
  revokeCatalogLink,
  buildCatalogUrl
} from '@/lib/services/catalogLinkService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { CatalogLinkStatus } from '@prisma/client';

const updateSchema = z.object({
  displayName: z.string().max(200).optional(),
  customPricing: z.record(z.number().positive()).nullable().optional(),
  productSubset: z.array(z.string()).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional().transform(val => val ? new Date(val) : val === null ? null : undefined),
  status: z.nativeEnum(CatalogLinkStatus).optional()
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required');
    }

    const { id } = await params;
    const catalogLink = await getCatalogLink(id);

    if (!catalogLink) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Catalog link not found');
    }

    return Response.json({
      ...catalogLink,
      catalogUrl: buildCatalogUrl(catalogLink.token)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required');
    }

    const { id } = await params;
    const body = await req.json();
    const validated = updateSchema.parse(body);

    const catalogLink = await updateCatalogLink(id, validated, session.user.id);

    return Response.json({
      ...catalogLink,
      catalogUrl: buildCatalogUrl(catalogLink.token)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required');
    }

    const { id } = await params;
    await revokeCatalogLink(id, session.user.id);

    return Response.json({ success: true, message: 'Catalog link revoked' });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Catalog Links Admin API
 *
 * GET  /api/ops/catalog-links - List all catalog links
 * POST /api/ops/catalog-links - Create a new catalog link
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/auth';
import {
  listCatalogLinks,
  createCatalogLink,
  buildCatalogUrl
} from '@/lib/services/catalogLinkService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { CatalogLinkStatus } from '@prisma/client';

const createSchema = z.object({
  retailerId: z.string().min(1, 'Retailer ID is required'),
  displayName: z.string().max(200).optional(),
  customPricing: z.record(z.number().positive()).optional(),
  categorySubset: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined)
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required');
    }

    const { searchParams } = new URL(req.url);
    const retailerId = searchParams.get('retailerId') || undefined;
    const status = searchParams.get('status') as CatalogLinkStatus | undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { links, total } = await listCatalogLinks({
      retailerId,
      status,
      limit,
      offset
    });

    // Add full URL to each link
    const linksWithUrl = links.map(link => ({
      ...link,
      catalogUrl: buildCatalogUrl(link.token)
    }));

    return Response.json({
      links: linksWithUrl,
      total,
      limit,
      offset
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required');
    }

    const body = await req.json();
    const validated = createSchema.parse(body);

    const catalogLink = await createCatalogLink({
      ...validated,
      createdById: session.user.id
    });

    return Response.json(
      {
        ...catalogLink,
        catalogUrl: buildCatalogUrl(catalogLink.token)
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

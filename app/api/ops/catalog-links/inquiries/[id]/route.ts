/**
 * PATCH /api/ops/catalog-links/inquiries/[id]
 *
 * Update inquiry status and notes.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/auth';
import { updateInquiryStatus } from '@/lib/services/catalogLinkService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { InquiryStatus } from '@prisma/client';

const updateSchema = z.object({
  status: z.nativeEnum(InquiryStatus),
  notes: z.string().max(2000).optional()
});

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

    const inquiry = await updateInquiryStatus(
      id,
      validated.status,
      session.user.id,
      validated.notes
    );

    return Response.json(inquiry);
  } catch (error) {
    return handleApiError(error);
  }
}

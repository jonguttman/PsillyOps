// API Route: AI Document Ingest - Reject document import
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { rejectDocumentImport } from '@/lib/services/aiIngestService';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';

/**
 * POST - Reject a document import
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Validate authentication
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // 2. Check permissions
    if (!hasPermission(session.user.role, 'ai', 'ingest')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions to reject document imports' },
        { status: 403 }
      );
    }

    // 3. Parse request body for optional reason
    let reason: string | undefined;
    try {
      const body = await req.json();
      reason = body.reason;
    } catch {
      // Body is optional
    }

    // 4. Reject the document import
    const { id } = await params;
    const docImport = await rejectDocumentImport(id, reason, session.user.id);

    // 5. Return response
    return Response.json({
      success: true,
      message: 'Document import rejected',
      import: {
        id: docImport.id,
        status: docImport.status,
        error: docImport.error,
        reviewedAt: docImport.reviewedAt,
      }
    });

  } catch (error) {
    return handleApiError(error);
  }
}

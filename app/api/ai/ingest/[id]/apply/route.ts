// API Route: AI Document Ingest - Apply document import
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { applyDocumentImport } from '@/lib/services/aiIngestService';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';

/**
 * POST - Apply all commands from a document import
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
        { code: 'FORBIDDEN', message: 'Insufficient permissions to apply document imports' },
        { status: 403 }
      );
    }

    // 3. Apply the document import
    const { id } = await params;
    const result = await applyDocumentImport(id, session.user.id);

    // 4. Return response
    return Response.json({
      success: result.success,
      message: result.message,
      appliedCommands: result.appliedCommands,
      failedCommands: result.failedCommands,
      results: result.results,
    });

  } catch (error) {
    return handleApiError(error);
  }
}

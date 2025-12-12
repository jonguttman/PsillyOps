// API Route: AI Document Ingest - Create new document import
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { createDocumentImport, listDocumentImports } from '@/lib/services/aiIngestService';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';

/**
 * POST - Create a new document import
 */
export async function POST(req: NextRequest) {
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
        { code: 'FORBIDDEN', message: 'Insufficient permissions to use AI ingest' },
        { status: 403 }
      );
    }

    // 3. Parse request body
    const body = await req.json();
    const { text, sourceType, originalName, contentType } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Text content is required' },
        { status: 400 }
      );
    }

    const validSourceTypes = ['PASTE', 'UPLOAD', 'EMAIL'];
    const source = (sourceType || 'PASTE').toUpperCase();
    if (!validSourceTypes.includes(source)) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Invalid sourceType. Must be PASTE, UPLOAD, or EMAIL' },
        { status: 400 }
      );
    }

    // 4. Create the document import
    const docImport = await createDocumentImport(
      text.trim(),
      source as 'PASTE' | 'UPLOAD' | 'EMAIL',
      session.user.id,
      originalName,
      contentType
    );

    // 5. Return response
    return Response.json({
      success: true,
      import: {
        id: docImport.id,
        sourceType: docImport.sourceType,
        status: docImport.status,
        confidence: docImport.confidence,
        commandCount: (docImport.aiResult as any)?.commands?.length || 0,
        error: docImport.error,
        createdAt: docImport.createdAt,
      }
    });

  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET - List document imports
 */
export async function GET(req: NextRequest) {
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
    if (!hasPermission(session.user.role, 'ai', 'view')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // 3. Parse query parameters
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const sourceType = searchParams.get('sourceType') as any;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // 4. Fetch document imports
    const { items, total } = await listDocumentImports({
      status,
      sourceType,
      limit,
      offset,
    });

    // 5. Return response
    return Response.json({
      items,
      total,
      limit,
      offset,
    });

  } catch (error) {
    return handleApiError(error);
  }
}

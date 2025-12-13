// API Route: Create Label Version with File Upload
// STRICT LAYERING: Validate → Call Service → Return JSON
// File upload is coupled to version creation (no standalone upload)

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { createVersion } from '@/lib/services/labelService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Validate auth
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!hasPermission(session.user.role, 'inventory', 'manage')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id: templateId } = await params;

    // Parse multipart form data
    const formData = await req.formData();
    
    const file = formData.get('file') as File | null;
    const version = formData.get('version') as string | null;
    const qrTemplate = formData.get('qrTemplate') as string | null;
    const notes = formData.get('notes') as string | null;

    // Validate required fields
    if (!file) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'File is required');
    }

    if (!version) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Version is required');
    }

    // Validate version format
    const versionRegex = /^[0-9]+\.[0-9]+(\.[0-9]+)?$/;
    if (!versionRegex.test(version)) {
      throw new AppError(
        ErrorCodes.INVALID_INPUT,
        'Version must be in format X.Y or X.Y.Z (e.g., 1.0, 2.1.3)'
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // 2. Call Service
    const templateVersion = await createVersion({
      templateId,
      version,
      file: fileBuffer,
      fileName: file.name,
      qrTemplate: qrTemplate || undefined,
      notes: notes || undefined,
      userId: session.user.id
    });

    // 3. Return JSON
    return Response.json({ version: templateVersion }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}


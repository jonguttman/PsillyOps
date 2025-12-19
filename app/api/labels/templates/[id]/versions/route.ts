// API Route: Create Label Version with File Upload
// STRICT LAYERING: Validate → Call Service → Return JSON
// File upload is coupled to version creation (no standalone upload)

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { createVersion } from '@/lib/services/labelService';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db/prisma';
import { getLabelStorage } from '@/lib/services/labelStorage';
import { logAction } from '@/lib/services/loggingService';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('[VersionUpload] POST request received');
  
  try {
    // 1. Validate auth
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!hasPermission(session.user.role, 'templates', 'create')) {
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
    
    console.log('[VersionUpload] File received:', {
      fileName: file.name,
      fileSize: fileBuffer.length,
      version,
      templateId,
    });

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
    console.error('[VersionUpload] Error:', {
      error: String(error),
      stack: (error as Error)?.stack,
    });
    return handleApiError(error);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { versionId } = await req.json();

    if (!versionId) {
      return new Response('Version ID is required', { status: 400 });
    }

    const version = await prisma.labelTemplateVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      return new Response('Label version not found', { status: 404 });
    }

    if (version.isActive) {
      return new Response(
        'Active label versions cannot be deleted',
        { status: 400 }
      );
    }

    // Delete file from storage
    const labelStorage = getLabelStorage();
    if (version.fileUrl) {
      await labelStorage.delete(version.fileUrl);
    }

    // Delete DB record
    await prisma.labelTemplateVersion.delete({
      where: { id: versionId },
    });

    await logAction({
      entityType: 'LABEL',
      entityId: versionId, // Note: entityId usually refers to the existing entity. Since it's deleted, this might be tricky for filtering, but logging the ID is standard.
      action: 'label_version_deleted',
      userId: session.user.id,
      summary: `Deleted label version ${version.version}`,
      metadata: {
        templateId: version.templateId,
        version: version.version
      }
    });

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

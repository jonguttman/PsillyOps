import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { getAssetStorage, validateAssetFile, getFileExtension } from '@/lib/services/assetStorage';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Verify batch exists
    const batch = await prisma.batch.findUnique({
      where: { id },
      select: { id: true, batchCode: true, coaUrl: true, product: { select: { name: true } } }
    });

    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }

    // Get the uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate the file
    const validation = validateAssetFile(
      'batch-coa',
      file.name,
      file.type,
      file.size
    );

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = getFileExtension(file.name);

    // Save to storage
    const storage = getAssetStorage();
    const url = await storage.save('batch-coa', id, buffer, ext);

    // Delete old COA if it exists and is a blob URL
    if (batch.coaUrl && batch.coaUrl.startsWith('http')) {
      try {
        await storage.delete(batch.coaUrl);
      } catch {
        // Ignore deletion errors
      }
    }

    const uploadedAt = new Date();

    // Update batch in database
    await prisma.batch.update({
      where: { id },
      data: {
        coaUrl: url,
        coaUploadedAt: uploadedAt
      }
    });

    // Log the action
    await logAction({
      entityType: ActivityEntity.BATCH,
      entityId: id,
      action: 'coa_uploaded',
      userId: session.user.id,
      summary: `Uploaded COA for batch "${batch.batchCode}"`,
      before: { coaUrl: batch.coaUrl },
      after: { coaUrl: url },
      tags: ['batch', 'coa', 'upload']
    });

    return NextResponse.json({
      url,
      uploadedAt: uploadedAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    console.error('COA upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload COA' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Verify batch exists
    const batch = await prisma.batch.findUnique({
      where: { id },
      select: { id: true, batchCode: true, coaUrl: true }
    });

    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }

    // Delete from storage if it's a blob URL
    if (batch.coaUrl && batch.coaUrl.startsWith('http')) {
      const storage = getAssetStorage();
      try {
        await storage.delete(batch.coaUrl);
      } catch {
        // Ignore deletion errors
      }
    }

    // Update batch in database
    await prisma.batch.update({
      where: { id },
      data: {
        coaUrl: null,
        coaUploadedAt: null
      }
    });

    // Log the action
    await logAction({
      entityType: ActivityEntity.BATCH,
      entityId: id,
      action: 'coa_removed',
      userId: session.user.id,
      summary: `Removed COA for batch "${batch.batchCode}"`,
      before: { coaUrl: batch.coaUrl },
      after: { coaUrl: null },
      tags: ['batch', 'coa', 'removed']
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('COA delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete COA' },
      { status: 500 }
    );
  }
}

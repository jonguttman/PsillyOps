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

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, publicImageUrl: true }
    });

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
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
      'product-image',
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
    const url = await storage.save('product-image', id, buffer, ext);

    // Delete old image if it exists and is a blob URL
    if (product.publicImageUrl && product.publicImageUrl.startsWith('http')) {
      try {
        await storage.delete(product.publicImageUrl);
      } catch {
        // Ignore deletion errors
      }
    }

    // Update product in database
    await prisma.product.update({
      where: { id },
      data: { publicImageUrl: url }
    });

    // Log the action
    await logAction({
      entityType: ActivityEntity.PRODUCT,
      entityId: id,
      action: 'image_uploaded',
      userId: session.user.id,
      summary: `Uploaded product image for "${product.name}"`,
      before: { publicImageUrl: product.publicImageUrl },
      after: { publicImageUrl: url },
      tags: ['product', 'image', 'upload']
    });

    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    console.error('Product image upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload image' },
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

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, publicImageUrl: true }
    });

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Delete from storage if it's a blob URL
    if (product.publicImageUrl && product.publicImageUrl.startsWith('http')) {
      const storage = getAssetStorage();
      try {
        await storage.delete(product.publicImageUrl);
      } catch {
        // Ignore deletion errors
      }
    }

    // Update product in database
    await prisma.product.update({
      where: { id },
      data: { publicImageUrl: null }
    });

    // Log the action
    await logAction({
      entityType: ActivityEntity.PRODUCT,
      entityId: id,
      action: 'image_removed',
      userId: session.user.id,
      summary: `Removed product image for "${product.name}"`,
      before: { publicImageUrl: product.publicImageUrl },
      after: { publicImageUrl: null },
      tags: ['product', 'image', 'removed']
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Product image delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    );
  }
}

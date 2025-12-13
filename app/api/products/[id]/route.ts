import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/services/loggingService";
import { ActivityEntity } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        strain: {
          select: { id: true, name: true, shortCode: true }
        }
      }
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: "Failed to fetch product" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "REP") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, sku, unitOfMeasure, reorderPoint, leadTimeDays, defaultBatchSize, wholesalePrice, strainId } = body;

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id },
      include: {
        strain: { select: { id: true, name: true, shortCode: true } }
      }
    });

    if (!existingProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Check for duplicate SKU if SKU is being changed
    if (sku && sku !== existingProduct.sku) {
      const duplicateSku = await prisma.product.findUnique({
        where: { sku },
      });

      if (duplicateSku) {
        return NextResponse.json(
          { error: "A product with this SKU already exists" },
          { status: 400 }
        );
      }
    }

    // Validate strainId if provided
    if (strainId !== undefined && strainId !== null) {
      const strain = await prisma.strain.findUnique({
        where: { id: strainId }
      });
      if (!strain) {
        return NextResponse.json(
          { error: "Invalid strain ID" },
          { status: 400 }
        );
      }
    }

    // Track strain changes for logging
    const strainChanged = strainId !== undefined && strainId !== existingProduct.strainId;
    const oldStrainName = existingProduct.strain?.name ?? null;

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(sku && { sku }),
        ...(unitOfMeasure && { unitOfMeasure }),
        ...(reorderPoint !== undefined && { reorderPoint: parseInt(reorderPoint, 10) }),
        ...(leadTimeDays !== undefined && { leadTimeDays: parseInt(leadTimeDays, 10) }),
        ...(defaultBatchSize !== undefined && {
          defaultBatchSize: defaultBatchSize ? parseInt(defaultBatchSize, 10) : null,
        }),
        ...(wholesalePrice !== undefined && {
          wholesalePrice: wholesalePrice !== null && wholesalePrice !== '' ? parseFloat(wholesalePrice) : null,
        }),
        ...(strainId !== undefined && { strainId: strainId || null }),
      },
      include: {
        strain: { select: { id: true, name: true, shortCode: true } }
      }
    });

    // Log strain change if applicable
    if (strainChanged) {
      await logAction({
        entityType: ActivityEntity.PRODUCT,
        entityId: id,
        action: 'strain_updated',
        userId: session.user.id,
        summary: strainId 
          ? `Updated product "${product.name}" strain to "${product.strain?.name}"`
          : `Removed strain from product "${product.name}"`,
        before: { strainId: existingProduct.strainId, strainName: oldStrainName },
        after: { strainId: product.strainId, strainName: product.strain?.name ?? null },
        tags: ['product', 'strain', 'updated']
      });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error("Error updating product:", error);
    return NextResponse.json(
      { error: "Failed to update product" },
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

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "REP") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id },
    });

    if (!existingProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Soft delete - set active to false
    await prisma.product.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true, message: "Product archived" });
  } catch (error) {
    console.error("Error archiving product:", error);
    return NextResponse.json(
      { error: "Failed to archive product" },
      { status: 500 }
    );
  }
}


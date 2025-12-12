import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

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
    const { name, sku, unitOfMeasure, reorderPoint, leadTimeDays, defaultBatchSize, wholesalePrice } = body;

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id },
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
      },
    });

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


import { auth } from "@/lib/auth/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  getProductCategories,
  assignProductToCategories,
} from "@/lib/services/productCategoryService";

// GET /api/products/[id]/categories - Get categories for a product
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

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const categories = await getProductCategories(id);

    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error fetching product categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch product categories" },
      { status: 500 }
    );
  }
}

// PUT /api/products/[id]/categories - Replace all category assignments for a product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only ADMIN can modify product categories
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { categoryIds } = body;

    if (!Array.isArray(categoryIds)) {
      return NextResponse.json(
        { error: "categoryIds must be an array" },
        { status: 400 }
      );
    }

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Validate that all category IDs exist
    if (categoryIds.length > 0) {
      const existingCategories = await prisma.productCategory.findMany({
        where: { id: { in: categoryIds }, active: true },
        select: { id: true },
      });

      const existingIds = new Set(existingCategories.map((c) => c.id));
      const invalidIds = categoryIds.filter((cid) => !existingIds.has(cid));

      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: `Invalid category IDs: ${invalidIds.join(", ")}` },
          { status: 400 }
        );
      }
    }

    await assignProductToCategories(id, categoryIds, session.user.id);

    // Return updated categories
    const updatedCategories = await getProductCategories(id);

    return NextResponse.json(updatedCategories);
  } catch (error) {
    console.error("Error updating product categories:", error);
    return NextResponse.json(
      { error: "Failed to update product categories" },
      { status: 500 }
    );
  }
}

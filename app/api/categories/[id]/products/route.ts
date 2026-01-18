import { auth } from "@/lib/auth/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  bulkAssignProductsToCategory,
  bulkRemoveProductsFromCategory,
} from "@/lib/services/productCategoryService";

// GET /api/categories/[id]/products - Get products in a category
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

    const category = await prisma.productCategory.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                wholesalePrice: true,
                publicImageUrl: true,
                active: true,
                strain: {
                  select: { id: true, name: true, shortCode: true },
                },
              },
            },
          },
        },
      },
    });

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const products = category.products.map((p) => p.product);

    return NextResponse.json(products);
  } catch (error) {
    console.error("Error fetching category products:", error);
    return NextResponse.json(
      { error: "Failed to fetch category products" },
      { status: 500 }
    );
  }
}

// POST /api/categories/[id]/products - Add products to a category
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only ADMIN can assign products to categories
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { productIds } = body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: "productIds must be a non-empty array" },
        { status: 400 }
      );
    }

    const result = await bulkAssignProductsToCategory(
      id,
      productIds,
      session.user.id
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error assigning products to category:", error);
    return NextResponse.json(
      { error: "Failed to assign products to category" },
      { status: 500 }
    );
  }
}

// DELETE /api/categories/[id]/products - Remove products from a category
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only ADMIN can remove products from categories
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { productIds } = body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: "productIds must be a non-empty array" },
        { status: 400 }
      );
    }

    const result = await bulkRemoveProductsFromCategory(
      id,
      productIds,
      session.user.id
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error removing products from category:", error);
    return NextResponse.json(
      { error: "Failed to remove products from category" },
      { status: 500 }
    );
  }
}

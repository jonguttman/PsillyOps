import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "REP") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, sku, unitOfMeasure, reorderPoint, leadTimeDays, defaultBatchSize } = body;

    if (!name || !sku || !unitOfMeasure) {
      return NextResponse.json(
        { error: "Name, SKU, and Unit of Measure are required" },
        { status: 400 }
      );
    }

    // Check for duplicate SKU
    const existingProduct = await prisma.product.findUnique({
      where: { sku },
    });

    if (existingProduct) {
      return NextResponse.json(
        { error: "A product with this SKU already exists" },
        { status: 400 }
      );
    }

    const product = await prisma.product.create({
      data: {
        name,
        sku,
        unitOfMeasure,
        reorderPoint: reorderPoint ? parseInt(reorderPoint, 10) : 0,
        leadTimeDays: leadTimeDays ? parseInt(leadTimeDays, 10) : 0,
        defaultBatchSize: defaultBatchSize ? parseInt(defaultBatchSize, 10) : null,
        active: true,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 }
    );
  }
}

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const strainId = searchParams.get('strainId');

    const where: any = {};
    if (!includeInactive) {
      where.active = true;
    }
    if (strainId) {
      where.strainId = strainId;
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        strain: {
          select: { id: true, name: true, shortCode: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error("Error listing products:", error);
    return NextResponse.json(
      { error: "Failed to list products" },
      { status: 500 }
    );
  }
}

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
    const { name, sku, unitOfMeasure, reorderPoint, leadTimeDays, defaultBatchSize, wholesalePrice, strainId } = body;

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

    // Validate strainId if provided
    if (strainId) {
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

    const product = await prisma.product.create({
      data: {
        name,
        sku,
        unitOfMeasure,
        reorderPoint: reorderPoint ? parseInt(reorderPoint, 10) : 0,
        leadTimeDays: leadTimeDays ? parseInt(leadTimeDays, 10) : 0,
        defaultBatchSize: defaultBatchSize ? parseInt(defaultBatchSize, 10) : null,
        wholesalePrice: wholesalePrice ? parseFloat(wholesalePrice) : null,
        strainId: strainId || null,
        active: true,
      },
      include: {
        strain: {
          select: { id: true, name: true, shortCode: true }
        }
      }
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


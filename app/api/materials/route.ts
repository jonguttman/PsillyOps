import { auth } from "@/lib/auth/auth";
import { NextRequest, NextResponse } from "next/server";
import { getMaterialsList, createMaterial } from "@/lib/services/materialService";

// GET /api/materials - List all materials
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "REP") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const materials = await getMaterialsList(includeInactive);

    // Transform for API response
    const response = materials.map(m => ({
      id: m.id,
      name: m.name,
      sku: m.sku,
      unitOfMeasure: m.unitOfMeasure,
      category: m.category,
      description: m.description,
      currentStockQty: m.currentStockQty,
      reorderPoint: m.reorderPoint,
      reorderQuantity: m.reorderQuantity,
      moq: m.moq,
      leadTimeDays: m.leadTimeDays,
      active: m.active,
      preferredVendor: m.preferredVendor,
      currentCost: m.vendors[0]?.lastPrice || null,
      inventoryCount: m._count.inventory,
      bomUsageCount: m._count.bomUsage
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching materials:", error);
    return NextResponse.json(
      { error: "Failed to fetch materials" },
      { status: 500 }
    );
  }
}

// POST /api/materials - Create a new material
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
    const { name, sku, unitOfMeasure, category, description, reorderPoint, reorderQuantity, moq, leadTimeDays } = body;

    // Validation
    if (!name || !sku || !unitOfMeasure) {
      return NextResponse.json(
        { error: "Name, SKU, and Unit of Measure are required" },
        { status: 400 }
      );
    }

    const material = await createMaterial(
      {
        name,
        sku,
        unitOfMeasure,
        category,
        description,
        reorderPoint: reorderPoint ? parseFloat(reorderPoint) : undefined,
        reorderQuantity: reorderQuantity ? parseFloat(reorderQuantity) : undefined,
        moq: moq ? parseFloat(moq) : undefined,
        leadTimeDays: leadTimeDays ? parseInt(leadTimeDays, 10) : undefined
      },
      session.user.id
    );

    return NextResponse.json(material, { status: 201 });
  } catch (error) {
    console.error("Error creating material:", error);
    
    // Check for unique constraint violation
    if (error && typeof error === 'object' && 'code' in error && error.code === "P2002") {
      return NextResponse.json(
        { error: "A material with this SKU already exists" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create material" },
      { status: 500 }
    );
  }
}


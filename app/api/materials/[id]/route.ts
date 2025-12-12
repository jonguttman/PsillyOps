import { auth } from "@/lib/auth/auth";
import { NextRequest, NextResponse } from "next/server";
import { getMaterialWithVendors, updateMaterial, archiveMaterial } from "@/lib/services/materialService";

// GET /api/materials/[id] - Get material details
export async function GET(
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
    const material = await getMaterialWithVendors(id);

    if (!material) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    return NextResponse.json(material);
  } catch (error) {
    console.error("Error fetching material:", error);
    return NextResponse.json(
      { error: "Failed to fetch material" },
      { status: 500 }
    );
  }
}

// PATCH /api/materials/[id] - Update material
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

    const {
      name,
      sku,
      unitOfMeasure,
      category,
      description,
      reorderPoint,
      reorderQuantity,
      moq,
      leadTimeDays,
      active
    } = body;

    const material = await updateMaterial(
      id,
      {
        name,
        sku,
        unitOfMeasure,
        category,
        description,
        reorderPoint: reorderPoint !== undefined ? parseFloat(reorderPoint) : undefined,
        reorderQuantity: reorderQuantity !== undefined ? parseFloat(reorderQuantity) : undefined,
        moq: moq !== undefined ? parseFloat(moq) : undefined,
        leadTimeDays: leadTimeDays !== undefined ? parseInt(leadTimeDays, 10) : undefined,
        active
      },
      session.user.id
    );

    return NextResponse.json(material);
  } catch (error) {
    console.error("Error updating material:", error);

    if (error instanceof Error && error.message === "Material not found") {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    if (error && typeof error === 'object' && 'code' in error && error.code === "P2002") {
      return NextResponse.json(
        { error: "A material with this SKU already exists" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update material" },
      { status: 500 }
    );
  }
}

// DELETE /api/materials/[id] - Archive material (soft delete)
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

    await archiveMaterial(id, session.user.id);

    return NextResponse.json({ success: true, message: "Material archived" });
  } catch (error) {
    console.error("Error archiving material:", error);

    if (error && typeof error === 'object' && 'code' in error && error.code === "P2025") {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to archive material" },
      { status: 500 }
    );
  }
}

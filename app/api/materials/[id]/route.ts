import { auth } from "@/lib/auth/auth";
import { NextRequest, NextResponse } from "next/server";
import { getMaterialWithVendors, updateMaterial, archiveMaterial, canDeleteMaterial, deleteMaterial } from "@/lib/services/materialService";
import { MaterialCategory } from "@/lib/types/enums";

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

    if (category !== undefined && !Object.values(MaterialCategory).includes(category as MaterialCategory)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

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

// DELETE /api/materials/[id] - Permanently delete material (hard delete)
// Only works for archived materials with no dependencies
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

    // Server-side guard: check if deletion is allowed
    const checkResult = await canDeleteMaterial(id);
    
    if (!checkResult.canDelete) {
      return NextResponse.json(
        { error: checkResult.reason || "Cannot delete material" },
        { status: 400 }
      );
    }

    // Perform hard delete
    const result = await deleteMaterial(id, session.user.id);

    return NextResponse.json({ 
      success: true, 
      message: "Material permanently deleted",
      material: result 
    });
  } catch (error) {
    console.error("Error deleting material:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error && typeof error === 'object' && 'code' in error && error.code === "P2025") {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to delete material" },
      { status: 500 }
    );
  }
}


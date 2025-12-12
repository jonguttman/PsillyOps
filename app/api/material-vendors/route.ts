import { auth } from "@/lib/auth/auth";
import { NextRequest, NextResponse } from "next/server";
import { upsertMaterialVendor } from "@/lib/services/materialService";

// POST /api/material-vendors - Create a material-vendor relationship
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
    const {
      materialId,
      vendorId,
      leadTimeDays,
      lastPrice,
      moq,
      preferred,
      notes
    } = body;

    // Validation
    if (!materialId || !vendorId) {
      return NextResponse.json(
        { error: "Material ID and Vendor ID are required" },
        { status: 400 }
      );
    }

    const materialVendor = await upsertMaterialVendor(
      {
        materialId,
        vendorId,
        leadTimeDays: leadTimeDays !== undefined ? parseInt(leadTimeDays, 10) : undefined,
        lastPrice: lastPrice !== undefined ? parseFloat(lastPrice) : undefined,
        moq: moq !== undefined ? parseFloat(moq) : undefined,
        preferred: preferred === true,
        notes
      },
      session.user.id
    );

    return NextResponse.json(materialVendor, { status: 201 });
  } catch (error) {
    console.error("Error creating material-vendor relationship:", error);

    if (error instanceof Error && error.message === "Material or Vendor not found") {
      return NextResponse.json(
        { error: "Material or Vendor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create material-vendor relationship" },
      { status: 500 }
    );
  }
}


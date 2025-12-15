import { auth } from "@/lib/auth/auth";
import { NextRequest, NextResponse } from "next/server";
import { getMaterialCostHistory, recordCostChange } from "@/lib/services/materialService";

// GET /api/material-cost-history/[materialId] - Get cost history for a material
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ materialId: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "REP") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { materialId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const history = await getMaterialCostHistory(materialId, limit);

    return NextResponse.json(history);
  } catch (error) {
    console.error("Error fetching cost history:", error);
    return NextResponse.json(
      { error: "Failed to fetch cost history" },
      { status: 500 }
    );
  }
}

// POST /api/material-cost-history/[materialId] - Add a cost history entry
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ materialId: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "REP") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { materialId } = await params;
    const body = await request.json();
    const { vendorId, price, source, notes } = body;

    // Validation
    if (price === undefined || price === null) {
      return NextResponse.json(
        { error: "Price is required" },
        { status: 400 }
      );
    }

    await recordCostChange(
      materialId,
      vendorId || null,
      parseFloat(price),
      source || "MANUAL",
      notes,
      session.user.id
    );

    return NextResponse.json({ success: true, message: "Cost recorded" }, { status: 201 });
  } catch (error) {
    console.error("Error recording cost:", error);

    if (error instanceof Error && error.message === "Material not found") {
      return NextResponse.json(
        { error: "Material not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to record cost" },
      { status: 500 }
    );
  }
}



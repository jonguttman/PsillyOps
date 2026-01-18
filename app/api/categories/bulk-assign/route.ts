import { auth } from "@/lib/auth/auth";
import { NextRequest, NextResponse } from "next/server";
import { bulkAssignCategories } from "@/lib/services/productCategoryService";

// POST /api/categories/bulk-assign - Bulk assign categories to products
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only ADMIN can bulk assign categories
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { assignments, mode = "add" } = body;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json(
        { error: "assignments must be a non-empty array" },
        { status: 400 }
      );
    }

    if (mode !== "add" && mode !== "replace") {
      return NextResponse.json(
        { error: "mode must be 'add' or 'replace'" },
        { status: 400 }
      );
    }

    // Validate assignment structure
    for (const assignment of assignments) {
      if (!assignment.productId || !Array.isArray(assignment.categoryIds)) {
        return NextResponse.json(
          { error: "Each assignment must have productId and categoryIds array" },
          { status: 400 }
        );
      }
    }

    const result = await bulkAssignCategories(
      assignments,
      mode,
      session.user.id
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error bulk assigning categories:", error);
    return NextResponse.json(
      { error: "Failed to bulk assign categories" },
      { status: 500 }
    );
  }
}

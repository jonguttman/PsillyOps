import { auth } from "@/lib/auth/auth";
import { NextRequest, NextResponse } from "next/server";
import { getCatalogData } from "@/lib/services/productCategoryService";

// GET /api/catalog - Get catalog data (categories with products)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const catalogData = await getCatalogData();

    return NextResponse.json({ categories: catalogData });
  } catch (error) {
    console.error("Error fetching catalog:", error);
    return NextResponse.json(
      { error: "Failed to fetch catalog" },
      { status: 500 }
    );
  }
}

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { logAction, generateSummary } from "@/lib/services/loggingService";
import { ActivityEntity } from "@prisma/client";

// GET /api/vendors - List all vendors
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

    const where = includeInactive ? {} : { active: true };

    const vendors = await prisma.vendor.findMany({
      where,
      include: {
        _count: {
          select: {
            materials: true,
            purchaseOrders: true
          }
        }
      },
      orderBy: { name: "asc" }
    });

    const response = vendors.map(v => ({
      id: v.id,
      name: v.name,
      contactName: v.contactName,
      contactEmail: v.contactEmail,
      contactPhone: v.contactPhone,
      address: v.address,
      paymentTerms: v.paymentTerms,
      defaultLeadTimeDays: v.defaultLeadTimeDays,
      notes: v.notes,
      active: v.active,
      materialsCount: v._count.materials,
      purchaseOrdersCount: v._count.purchaseOrders,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching vendors:", error);
    return NextResponse.json(
      { error: "Failed to fetch vendors" },
      { status: 500 }
    );
  }
}

// POST /api/vendors - Create a new vendor
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
      name,
      contactName,
      contactEmail,
      contactPhone,
      address,
      paymentTerms,
      defaultLeadTimeDays,
      notes
    } = body;

    // Validation
    if (!name) {
      return NextResponse.json(
        { error: "Vendor name is required" },
        { status: 400 }
      );
    }

    const vendor = await prisma.vendor.create({
      data: {
        name,
        contactName,
        contactEmail,
        contactPhone,
        address,
        paymentTerms,
        defaultLeadTimeDays: defaultLeadTimeDays ? parseInt(defaultLeadTimeDays, 10) : 0,
        notes,
        active: true
      }
    });

    await logAction({
      entityType: ActivityEntity.VENDOR,
      entityId: vendor.id,
      action: "created",
      userId: session.user.id,
      summary: generateSummary({
        action: "created",
        entityName: `vendor ${vendor.name}`
      }),
      tags: ["created", "vendor"]
    });

    return NextResponse.json(vendor, { status: 201 });
  } catch (error) {
    console.error("Error creating vendor:", error);
    return NextResponse.json(
      { error: "Failed to create vendor" },
      { status: 500 }
    );
  }
}





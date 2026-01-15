import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { logAction, generateSummary } from "@/lib/services/loggingService";
import { ActivityEntity } from "@prisma/client";

// GET /api/retailers - List all retailers
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // REP can view retailers (they need to see their customers)
    // but other roles also need access for order management

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";
    const search = searchParams.get("search") || "";

    const where: any = {};
    
    if (!includeInactive) {
      where.active = true;
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const retailers = await prisma.retailer.findMany({
      where,
      include: {
        salesRep: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        _count: {
          select: {
            orders: true,
            invoices: true,
          }
        }
      },
      orderBy: { name: "asc" }
    });

    const response = retailers.map(r => ({
      id: r.id,
      name: r.name,
      contactEmail: r.contactEmail,
      contactPhone: r.contactPhone,
      shippingAddress: r.shippingAddress,
      billingAddress: r.billingAddress,
      notes: r.notes,
      salesRepId: r.salesRepId,
      salesRep: r.salesRep,
      active: r.active,
      ordersCount: r._count.orders,
      invoicesCount: r._count.invoices,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching retailers:", error);
    return NextResponse.json(
      { error: "Failed to fetch retailers" },
      { status: 500 }
    );
  }
}

// POST /api/retailers - Create a new retailer
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only ADMIN can create retailers
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      contactEmail,
      contactPhone,
      shippingAddress,
      billingAddress,
      notes,
      salesRepId
    } = body;

    // Validation
    if (!name || name.trim() === '') {
      return NextResponse.json(
        { error: "Retailer name is required" },
        { status: 400 }
      );
    }

    // Check for duplicate name
    const existing = await prisma.retailer.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } }
    });
    
    if (existing) {
      return NextResponse.json(
        { error: "A retailer with this name already exists" },
        { status: 400 }
      );
    }

    // Validate sales rep if provided
    if (salesRepId) {
      const salesRep = await prisma.user.findUnique({
        where: { id: salesRepId }
      });
      if (!salesRep) {
        return NextResponse.json(
          { error: "Sales rep not found" },
          { status: 400 }
        );
      }
    }

    const retailer = await prisma.retailer.create({
      data: {
        name: name.trim(),
        contactEmail: contactEmail?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        shippingAddress: shippingAddress?.trim() || null,
        billingAddress: billingAddress?.trim() || null,
        notes: notes?.trim() || null,
        salesRepId: salesRepId || null,
        active: true
      },
      include: {
        salesRep: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      }
    });

    await logAction({
      entityType: ActivityEntity.ORDER, // Using ORDER as closest entity type for retailers
      entityId: retailer.id,
      action: "retailer_created",
      userId: session.user.id,
      summary: generateSummary({
        action: "created",
        entityName: `retailer ${retailer.name}`
      }),
      tags: ["created", "retailer"]
    });

    return NextResponse.json(retailer, { status: 201 });
  } catch (error) {
    console.error("Error creating retailer:", error);
    return NextResponse.json(
      { error: "Failed to create retailer" },
      { status: 500 }
    );
  }
}


import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { logAction, generateSummary } from "@/lib/services/loggingService";
import { ActivityEntity } from "@prisma/client";

// GET /api/retailers/[id] - Get retailer details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const retailer = await prisma.retailer.findUnique({
      where: { id },
      include: {
        salesRep: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        orders: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            createdAt: true,
            requestedShipDate: true,
            shippedAt: true,
          }
        },
        invoices: {
          take: 5,
          orderBy: { issuedAt: "desc" },
          select: {
            id: true,
            invoiceNo: true,
            issuedAt: true,
            subtotal: true,
          }
        },
        _count: {
          select: {
            orders: true,
            invoices: true,
          }
        }
      }
    });

    if (!retailer) {
      return NextResponse.json({ error: "Retailer not found" }, { status: 404 });
    }

    const response = {
      id: retailer.id,
      name: retailer.name,
      contactEmail: retailer.contactEmail,
      contactPhone: retailer.contactPhone,
      shippingAddress: retailer.shippingAddress,
      billingAddress: retailer.billingAddress,
      notes: retailer.notes,
      salesRepId: retailer.salesRepId,
      salesRep: retailer.salesRep,
      active: retailer.active,
      createdAt: retailer.createdAt,
      updatedAt: retailer.updatedAt,
      recentOrders: retailer.orders,
      recentInvoices: retailer.invoices,
      ordersCount: retailer._count.orders,
      invoicesCount: retailer._count.invoices
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching retailer:", error);
    return NextResponse.json(
      { error: "Failed to fetch retailer" },
      { status: 500 }
    );
  }
}

// PATCH /api/retailers/[id] - Update retailer
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only ADMIN can update retailers
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const before = await prisma.retailer.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Retailer not found" }, { status: 404 });
    }

    const {
      name,
      contactEmail,
      contactPhone,
      shippingAddress,
      billingAddress,
      notes,
      salesRepId,
      active
    } = body;

    // Check for duplicate name if name is being changed
    if (name && name !== before.name) {
      const existing = await prisma.retailer.findFirst({
        where: { 
          name: { equals: name, mode: 'insensitive' },
          id: { not: id }
        }
      });
      
      if (existing) {
        return NextResponse.json(
          { error: "A retailer with this name already exists" },
          { status: 400 }
        );
      }
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

    const retailer = await prisma.retailer.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(contactEmail !== undefined && { contactEmail: contactEmail?.trim() || null }),
        ...(contactPhone !== undefined && { contactPhone: contactPhone?.trim() || null }),
        ...(shippingAddress !== undefined && { shippingAddress: shippingAddress?.trim() || null }),
        ...(billingAddress !== undefined && { billingAddress: billingAddress?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(salesRepId !== undefined && { salesRepId: salesRepId || null }),
        ...(active !== undefined && { active })
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
      entityType: ActivityEntity.ORDER,
      entityId: retailer.id,
      action: "retailer_updated",
      userId: session.user.id,
      summary: generateSummary({
        action: "updated",
        entityName: `retailer ${retailer.name}`
      }),
      before,
      after: retailer,
      tags: ["updated", "retailer"]
    });

    return NextResponse.json(retailer);
  } catch (error) {
    console.error("Error updating retailer:", error);
    return NextResponse.json(
      { error: "Failed to update retailer" },
      { status: 500 }
    );
  }
}

// DELETE /api/retailers/[id] - Archive retailer (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only ADMIN can archive retailers
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const retailer = await prisma.retailer.findUnique({ where: { id } });
    if (!retailer) {
      return NextResponse.json({ error: "Retailer not found" }, { status: 404 });
    }

    // Check for pending orders
    const pendingOrders = await prisma.retailerOrder.count({
      where: {
        retailerId: id,
        status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED'] }
      }
    });

    if (pendingOrders > 0) {
      return NextResponse.json(
        { error: `Cannot archive retailer with ${pendingOrders} pending order(s)` },
        { status: 400 }
      );
    }

    await prisma.retailer.update({
      where: { id },
      data: { active: false }
    });

    await logAction({
      entityType: ActivityEntity.ORDER,
      entityId: id,
      action: "retailer_archived",
      userId: session.user.id,
      summary: `Archived retailer ${retailer.name}`,
      tags: ["archived", "deleted", "retailer"]
    });

    return NextResponse.json({ success: true, message: "Retailer archived" });
  } catch (error) {
    console.error("Error archiving retailer:", error);
    return NextResponse.json(
      { error: "Failed to archive retailer" },
      { status: 500 }
    );
  }
}


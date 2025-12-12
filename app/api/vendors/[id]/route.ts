import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { logAction, generateSummary } from "@/lib/services/loggingService";
import { ActivityEntity } from "@prisma/client";

// GET /api/vendors/[id] - Get vendor details
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

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: {
        materials: {
          include: {
            material: {
              select: {
                id: true,
                name: true,
                sku: true,
                category: true,
                unitOfMeasure: true
              }
            }
          }
        },
        purchaseOrders: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            poNumber: true,
            status: true,
            createdAt: true,
            receivedAt: true,
            expectedDeliveryDate: true
          }
        },
        _count: {
          select: {
            materials: true,
            purchaseOrders: true
          }
        }
      }
    });

    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    // Calculate some statistics
    const materialsWithPricing = vendor.materials.map(mv => ({
      materialVendorId: mv.id,
      materialId: mv.materialId,
      materialName: mv.material.name,
      materialSku: mv.material.sku,
      category: mv.material.category,
      unitOfMeasure: mv.material.unitOfMeasure,
      lastPrice: mv.lastPrice,
      leadTimeDays: mv.leadTimeDays,
      moq: mv.moq,
      preferred: mv.preferred,
      notes: mv.notes
    }));

    const response = {
      id: vendor.id,
      name: vendor.name,
      contactName: vendor.contactName,
      contactEmail: vendor.contactEmail,
      contactPhone: vendor.contactPhone,
      address: vendor.address,
      paymentTerms: vendor.paymentTerms,
      defaultLeadTimeDays: vendor.defaultLeadTimeDays,
      notes: vendor.notes,
      active: vendor.active,
      createdAt: vendor.createdAt,
      updatedAt: vendor.updatedAt,
      materials: materialsWithPricing,
      recentPurchaseOrders: vendor.purchaseOrders,
      materialsCount: vendor._count.materials,
      purchaseOrdersCount: vendor._count.purchaseOrders
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching vendor:", error);
    return NextResponse.json(
      { error: "Failed to fetch vendor" },
      { status: 500 }
    );
  }
}

// PATCH /api/vendors/[id] - Update vendor
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

    const before = await prisma.vendor.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const {
      name,
      contactName,
      contactEmail,
      contactPhone,
      address,
      paymentTerms,
      defaultLeadTimeDays,
      notes,
      active
    } = body;

    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(contactName !== undefined && { contactName }),
        ...(contactEmail !== undefined && { contactEmail }),
        ...(contactPhone !== undefined && { contactPhone }),
        ...(address !== undefined && { address }),
        ...(paymentTerms !== undefined && { paymentTerms }),
        ...(defaultLeadTimeDays !== undefined && {
          defaultLeadTimeDays: parseInt(defaultLeadTimeDays, 10)
        }),
        ...(notes !== undefined && { notes }),
        ...(active !== undefined && { active })
      }
    });

    await logAction({
      entityType: ActivityEntity.VENDOR,
      entityId: vendor.id,
      action: "updated",
      userId: session.user.id,
      summary: generateSummary({
        action: "updated",
        entityName: `vendor ${vendor.name}`
      }),
      before,
      after: vendor,
      tags: ["updated", "vendor"]
    });

    return NextResponse.json(vendor);
  } catch (error) {
    console.error("Error updating vendor:", error);
    return NextResponse.json(
      { error: "Failed to update vendor" },
      { status: 500 }
    );
  }
}

// DELETE /api/vendors/[id] - Archive vendor (soft delete)
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

    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    await prisma.vendor.update({
      where: { id },
      data: { active: false }
    });

    await logAction({
      entityType: ActivityEntity.VENDOR,
      entityId: id,
      action: "archived",
      userId: session.user.id,
      summary: `Archived vendor ${vendor.name}`,
      tags: ["archived", "deleted", "vendor"]
    });

    return NextResponse.json({ success: true, message: "Vendor archived" });
  } catch (error) {
    console.error("Error archiving vendor:", error);
    return NextResponse.json(
      { error: "Failed to archive vendor" },
      { status: 500 }
    );
  }
}

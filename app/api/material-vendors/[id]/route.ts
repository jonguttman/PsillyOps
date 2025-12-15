import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { setPreferredVendor, removeMaterialVendor, recordCostChange } from "@/lib/services/materialService";
import { logAction } from "@/lib/services/loggingService";
import { ActivityEntity } from "@prisma/client";

// PATCH /api/material-vendors/[id] - Update a material-vendor relationship
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

    const existing = await prisma.materialVendor.findUnique({
      where: { id },
      include: {
        material: true,
        vendor: true
      }
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Material-vendor relationship not found" },
        { status: 404 }
      );
    }

    const { leadTimeDays, lastPrice, moq, preferred, notes } = body;

    // Handle preferred toggle
    if (preferred === true && !existing.preferred) {
      await setPreferredVendor(existing.materialId, existing.vendorId, session.user.id);
    } else if (preferred === false && existing.preferred) {
      // Unset preferred
      await prisma.materialVendor.update({
        where: { id },
        data: { preferred: false }
      });
      await prisma.rawMaterial.update({
        where: { id: existing.materialId },
        data: { preferredVendorId: null }
      });
    }

    // Update other fields
    const updated = await prisma.materialVendor.update({
      where: { id },
      data: {
        ...(leadTimeDays !== undefined && { leadTimeDays: parseInt(leadTimeDays, 10) }),
        ...(lastPrice !== undefined && { lastPrice: parseFloat(lastPrice) }),
        ...(moq !== undefined && { moq: parseFloat(moq) }),
        ...(notes !== undefined && { notes })
      }
    });

    // If price changed, record in cost history
    if (lastPrice !== undefined && lastPrice !== existing.lastPrice) {
      await recordCostChange(
        existing.materialId,
        existing.vendorId,
        parseFloat(lastPrice),
        "VENDOR_UPDATE",
        undefined,
        session.user.id
      );
    }

    await logAction({
      entityType: ActivityEntity.MATERIAL,
      entityId: existing.materialId,
      action: "vendor_relationship_updated",
      userId: session.user.id,
      summary: `Updated vendor ${existing.vendor.name} for ${existing.material.name}`,
      before: existing,
      after: updated,
      tags: ["vendor", "relationship", "updated"]
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating material-vendor relationship:", error);
    return NextResponse.json(
      { error: "Failed to update material-vendor relationship" },
      { status: 500 }
    );
  }
}

// DELETE /api/material-vendors/[id] - Remove a material-vendor relationship
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

    await removeMaterialVendor(id, session.user.id);

    return NextResponse.json({ success: true, message: "Vendor relationship removed" });
  } catch (error) {
    console.error("Error removing material-vendor relationship:", error);

    if (error instanceof Error && error.message === "Material-Vendor relationship not found") {
      return NextResponse.json(
        { error: "Material-vendor relationship not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to remove material-vendor relationship" },
      { status: 500 }
    );
  }
}



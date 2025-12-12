import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/services/loggingService";
import { ActivityEntity } from "@prisma/client";

// GET /api/material-attachments/[materialId] - List attachments for a material
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

    const attachments = await prisma.materialAttachment.findMany({
      where: { materialId },
      orderBy: { uploadedAt: "desc" }
    });

    return NextResponse.json(attachments);
  } catch (error) {
    console.error("Error fetching attachments:", error);
    return NextResponse.json(
      { error: "Failed to fetch attachments" },
      { status: 500 }
    );
  }
}

// POST /api/material-attachments/[materialId] - Add an attachment (URL-based)
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
    const { fileName, fileUrl, fileType, notes } = body;

    // Validation
    if (!fileName || !fileUrl) {
      return NextResponse.json(
        { error: "File name and URL are required" },
        { status: 400 }
      );
    }

    // Verify material exists
    const material = await prisma.rawMaterial.findUnique({
      where: { id: materialId }
    });

    if (!material) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    const attachment = await prisma.materialAttachment.create({
      data: {
        materialId,
        fileName,
        fileUrl,
        fileType: fileType || "OTHER",
        notes
      }
    });

    await logAction({
      entityType: ActivityEntity.MATERIAL,
      entityId: materialId,
      action: "attachment_added",
      userId: session.user.id,
      summary: `Added attachment "${fileName}" to ${material.name}`,
      details: {
        fileName,
        fileType: fileType || "OTHER"
      },
      tags: ["attachment", "document"]
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("Error adding attachment:", error);
    return NextResponse.json(
      { error: "Failed to add attachment" },
      { status: 500 }
    );
  }
}

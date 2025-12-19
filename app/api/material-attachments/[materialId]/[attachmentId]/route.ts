import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/services/loggingService";
import { ActivityEntity } from "@prisma/client";

// DELETE /api/material-attachments/[materialId]/[attachmentId] - Remove an attachment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ materialId: string; attachmentId: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "REP") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { materialId, attachmentId } = await params;

    const attachment = await prisma.materialAttachment.findUnique({
      where: { id: attachmentId },
      include: { material: true }
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    if (attachment.materialId !== materialId) {
      return NextResponse.json(
        { error: "Attachment does not belong to this material" },
        { status: 400 }
      );
    }

    await prisma.materialAttachment.delete({
      where: { id: attachmentId }
    });

    await logAction({
      entityType: ActivityEntity.MATERIAL,
      entityId: materialId,
      action: "attachment_removed",
      userId: session.user.id,
      summary: `Removed attachment "${attachment.fileName}" from ${attachment.material.name}`,
      metadata: {
        fileName: attachment.fileName,
        fileType: attachment.fileType
      },
      tags: ["attachment", "deleted"]
    });

    return NextResponse.json({ success: true, message: "Attachment removed" });
  } catch (error) {
    console.error("Error removing attachment:", error);
    return NextResponse.json(
      { error: "Failed to remove attachment" },
      { status: 500 }
    );
  }
}






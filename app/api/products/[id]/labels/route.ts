/**
 * Product Label Associations API
 * 
 * GET   /api/products/:id/labels - Get associated label templates for a product (includes print settings)
 * PUT   /api/products/:id/labels - Set associated label templates for a product
 * PATCH /api/products/:id/labels - Update print settings for a specific template association
 * 
 * Associations are only allowed for templates with entityType = PRODUCT
 * and at least one active version.
 * 
 * Each product can designate one QR-carrier label and one barcode-carrier label.
 * When printing, only the carrier label(s) will include QR/barcode elements.
 * 
 * Print settings (quantity, margin) are stored per (product, template) association.
 */

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/services/loggingService";
import { ActivityEntity, LabelEntityType } from "@prisma/client";

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

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Get associated labels with template details, active version info, and carrier flags
    const associations = await prisma.productLabel.findMany({
      where: { productId: id },
      include: {
        template: {
          include: {
            versions: {
              where: { isActive: true },
              select: { id: true, version: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const labels = associations.map(assoc => ({
      templateId: assoc.templateId,
      templateName: assoc.template.name,
      hasActiveVersion: assoc.template.versions.length > 0,
      activeVersionIds: assoc.template.versions.map(v => v.id),
      isQrCarrier: assoc.isQrCarrier,
      isBarcodeCarrier: assoc.isBarcodeCarrier,
      // Per-template print settings
      labelPrintQuantity: assoc.labelPrintQuantity,
      sheetMarginTopBottomIn: assoc.sheetMarginTopBottomIn,
      labelWidthIn: assoc.labelWidthIn,
      labelHeightIn: assoc.labelHeightIn
    }));

    return NextResponse.json({ labels });
  } catch (error) {
    console.error("Error fetching product labels:", error);
    return NextResponse.json(
      { error: "Failed to fetch product labels" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Disallow REP role (same as product PATCH)
    if (session.user.role === "REP") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { 
      templateIds, 
      qrCarrierTemplateId, 
      barcodeCarrierTemplateId 
    } = body as { 
      templateIds: string[];
      qrCarrierTemplateId?: string | null;
      barcodeCarrierTemplateId?: string | null;
    };

    if (!Array.isArray(templateIds)) {
      return NextResponse.json(
        { error: "templateIds must be an array" },
        { status: 400 }
      );
    }

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, sku: true }
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Get current associations for logging
    const currentAssociations = await prisma.productLabel.findMany({
      where: { productId: id },
      include: { template: { select: { name: true } } }
    });
    const beforeTemplateIds = currentAssociations.map(a => a.templateId);
    const beforeTemplateNames = currentAssociations.map(a => a.template.name);
    const beforeQrCarrier = currentAssociations.find(a => a.isQrCarrier)?.templateId ?? null;
    const beforeBarcodeCarrier = currentAssociations.find(a => a.isBarcodeCarrier)?.templateId ?? null;

    // Validate all templateIds
    if (templateIds.length > 0) {
      const templates = await prisma.labelTemplate.findMany({
        where: {
          id: { in: templateIds },
          entityType: LabelEntityType.PRODUCT
        },
        include: {
          versions: {
            where: { isActive: true },
            select: { id: true }
          }
        }
      });

      // Check all templates exist and are PRODUCT type
      if (templates.length !== templateIds.length) {
        const foundIds = templates.map(t => t.id);
        const missingIds = templateIds.filter(tid => !foundIds.includes(tid));
        return NextResponse.json(
          { error: `Invalid or non-PRODUCT template IDs: ${missingIds.join(', ')}` },
          { status: 400 }
        );
      }

      // Check all templates have at least one active version
      const templatesWithoutActive = templates.filter(t => t.versions.length === 0);
      if (templatesWithoutActive.length > 0) {
        const names = templatesWithoutActive.map(t => t.name);
        return NextResponse.json(
          { error: `Templates without active versions cannot be associated: ${names.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Determine carrier assignments
    // Safe defaults: if only 1 template, it's both carriers; if unset, auto-pick first
    let finalQrCarrier: string | null = null;
    let finalBarcodeCarrier: string | null = null;

    if (templateIds.length === 1) {
      // Single label: it's both carriers
      finalQrCarrier = templateIds[0];
      finalBarcodeCarrier = templateIds[0];
    } else if (templateIds.length > 1) {
      // Multiple labels: use explicit selection or auto-pick first
      if (qrCarrierTemplateId && templateIds.includes(qrCarrierTemplateId)) {
        finalQrCarrier = qrCarrierTemplateId;
      } else {
        finalQrCarrier = templateIds[0]; // Auto-pick first
      }
      
      if (barcodeCarrierTemplateId && templateIds.includes(barcodeCarrierTemplateId)) {
        finalBarcodeCarrier = barcodeCarrierTemplateId;
      } else {
        finalBarcodeCarrier = templateIds[0]; // Auto-pick first
      }
    }

    // Upsert associations: preserve existing rows (and their print settings), update carrier flags
    await prisma.$transaction(async (tx) => {
      const existingTemplateIds = currentAssociations.map(a => a.templateId);
      const toRemove = existingTemplateIds.filter(tid => !templateIds.includes(tid));
      const toAdd = templateIds.filter(tid => !existingTemplateIds.includes(tid));
      const toUpdate = templateIds.filter(tid => existingTemplateIds.includes(tid));

      // Delete associations that are no longer present
      if (toRemove.length > 0) {
        await tx.productLabel.deleteMany({
          where: { productId: id, templateId: { in: toRemove } }
        });
      }

      // Create new associations
      if (toAdd.length > 0) {
        await tx.productLabel.createMany({
          data: toAdd.map(templateId => ({
            productId: id,
            templateId,
            isQrCarrier: templateId === finalQrCarrier,
            isBarcodeCarrier: templateId === finalBarcodeCarrier
          }))
        });
      }

      // Update carrier flags on existing associations (preserves print settings)
      for (const templateId of toUpdate) {
        await tx.productLabel.update({
          where: { productId_templateId: { productId: id, templateId } },
          data: {
            isQrCarrier: templateId === finalQrCarrier,
            isBarcodeCarrier: templateId === finalBarcodeCarrier
          }
        });
      }
    });

    // Get new associations for response and logging
    const newAssociations = await prisma.productLabel.findMany({
      where: { productId: id },
      include: {
        template: {
          include: {
            versions: {
              where: { isActive: true },
              select: { id: true, version: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const afterTemplateIds = newAssociations.map(a => a.templateId);
    const afterTemplateNames = newAssociations.map(a => a.template.name);
    const afterQrCarrier = newAssociations.find(a => a.isQrCarrier)?.templateId ?? null;
    const afterBarcodeCarrier = newAssociations.find(a => a.isBarcodeCarrier)?.templateId ?? null;

    // Log the change
    await logAction({
      entityType: ActivityEntity.PRODUCT,
      entityId: id,
      action: 'labels_updated',
      userId: session.user.id,
      summary: `Updated label associations for product "${product.name}" (${product.sku}): ${afterTemplateNames.length} template(s)`,
      before: { 
        templateIds: beforeTemplateIds, 
        templateNames: beforeTemplateNames,
        qrCarrier: beforeQrCarrier,
        barcodeCarrier: beforeBarcodeCarrier
      },
      after: { 
        templateIds: afterTemplateIds, 
        templateNames: afterTemplateNames,
        qrCarrier: afterQrCarrier,
        barcodeCarrier: afterBarcodeCarrier
      },
      tags: ['product', 'labels', 'updated']
    });

    const labels = newAssociations.map(assoc => ({
      templateId: assoc.templateId,
      templateName: assoc.template.name,
      hasActiveVersion: assoc.template.versions.length > 0,
      activeVersionIds: assoc.template.versions.map(v => v.id),
      isQrCarrier: assoc.isQrCarrier,
      isBarcodeCarrier: assoc.isBarcodeCarrier,
      // Per-template print settings
      labelPrintQuantity: assoc.labelPrintQuantity,
      sheetMarginTopBottomIn: assoc.sheetMarginTopBottomIn,
      labelWidthIn: assoc.labelWidthIn,
      labelHeightIn: assoc.labelHeightIn
    }));

    return NextResponse.json({ labels });
  } catch (error) {
    console.error("Error updating product labels:", error);
    return NextResponse.json(
      { error: "Failed to update product labels" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/products/:id/labels
 * Update print settings for a specific template association.
 * 
 * Body: { templateId, labelPrintQuantity?, sheetMarginTopBottomIn?, labelWidthIn?, labelHeightIn? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Disallow REP role
    if (session.user.role === "REP") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { 
      templateId, 
      labelPrintQuantity, 
      sheetMarginTopBottomIn,
      labelWidthIn,
      labelHeightIn
    } = body as { 
      templateId: string;
      labelPrintQuantity?: number | null;
      sheetMarginTopBottomIn?: number | null;
      labelWidthIn?: number | null;
      labelHeightIn?: number | null;
    };

    if (!templateId) {
      return NextResponse.json(
        { error: "templateId is required" },
        { status: 400 }
      );
    }

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Verify association exists
    const association = await prisma.productLabel.findUnique({
      where: { productId_templateId: { productId: id, templateId } }
    });

    if (!association) {
      return NextResponse.json(
        { error: "Label template not associated with this product" },
        { status: 404 }
      );
    }

    // Update print settings
    const updated = await prisma.productLabel.update({
      where: { productId_templateId: { productId: id, templateId } },
      data: {
        ...(labelPrintQuantity !== undefined && { labelPrintQuantity }),
        ...(sheetMarginTopBottomIn !== undefined && { sheetMarginTopBottomIn }),
        ...(labelWidthIn !== undefined && { labelWidthIn }),
        ...(labelHeightIn !== undefined && { labelHeightIn })
      },
      include: {
        template: {
          include: {
            versions: {
              where: { isActive: true },
              select: { id: true, version: true }
            }
          }
        }
      }
    });

    return NextResponse.json({
      templateId: updated.templateId,
      templateName: updated.template.name,
      hasActiveVersion: updated.template.versions.length > 0,
      activeVersionIds: updated.template.versions.map(v => v.id),
      isQrCarrier: updated.isQrCarrier,
      isBarcodeCarrier: updated.isBarcodeCarrier,
      labelPrintQuantity: updated.labelPrintQuantity,
      sheetMarginTopBottomIn: updated.sheetMarginTopBottomIn,
      labelWidthIn: updated.labelWidthIn,
      labelHeightIn: updated.labelHeightIn
    });
  } catch (error) {
    console.error("Error updating product label settings:", error);
    return NextResponse.json(
      { error: "Failed to update label settings" },
      { status: 500 }
    );
  }
}

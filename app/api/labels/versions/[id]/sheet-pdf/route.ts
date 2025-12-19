/**
 * Sheet PDF Download API
 * 
 * POST /api/labels/versions/[id]/sheet-pdf
 * 
 * Generates a print-ready PDF of labels arranged on letter-size sheets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderSheetPdfBuffer } from '@/lib/services/sheetPdfService';
import { PlaceableElement } from '@/lib/types/placement';
import { SheetDecorations } from '@/lib/constants/sheet';
import { 
  validateSheetConfig, 
  formatValidationError,
  MAX_LABELS_PER_JOB,
  MAX_LABEL_WIDTH_IN,
  MAX_LABEL_HEIGHT_IN,
  DEFAULT_MARGIN_TOP_BOTTOM_IN,
} from '@/lib/utils/sheetValidation';

interface SheetPdfRequestBody {
  quantity: number;
  elements?: PlaceableElement[];
  labelWidthIn?: number | null;
  labelHeightIn?: number | null;
  decorations?: SheetDecorations;
  // Optional entity info for barcode rendering
  entityType?: 'PRODUCT' | 'BATCH' | 'INVENTORY' | 'CUSTOM';
  entityId?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: versionId } = await params;
    
    if (!versionId) {
      return NextResponse.json(
        { error: 'Version ID is required' },
        { status: 400 }
      );
    }
    
    // Parse request body
    let body: SheetPdfRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    
    const { quantity, elements, labelWidthIn, labelHeightIn, decorations, entityType, entityId } = body;
    
    // Use defaults for validation if not provided
    const effectiveLabelWidth = labelWidthIn ?? 2;
    const effectiveLabelHeight = labelHeightIn ?? 1;
    const effectiveQuantity = typeof quantity === 'number' ? quantity : 1;
    
    // Validate using shared validation utility
    const validation = validateSheetConfig({
      labelWidthIn: effectiveLabelWidth,
      labelHeightIn: effectiveLabelHeight,
      marginTopBottomIn: DEFAULT_MARGIN_TOP_BOTTOM_IN,
      quantity: effectiveQuantity,
    });
    
    if (!validation.valid) {
      return NextResponse.json(
        { error: formatValidationError(validation) },
        { status: 400 }
      );
    }
    
    // Additional check: ensure labels fit on sheet
    if (validation.layout && validation.layout.perSheet === 0) {
      return NextResponse.json(
        { error: 'Label is too large to fit on a letter-size sheet' },
        { status: 400 }
      );
    }
    
    // Generate PDF using clamped quantity
    const result = await renderSheetPdfBuffer({
      versionId,
      quantity: validation.clampedQuantity,
      elements,
      labelWidthIn: effectiveLabelWidth,
      labelHeightIn: effectiveLabelHeight,
      decorations,
      // Pass entity info for barcode rendering (product.barcodeValue ?? product.sku)
      entityType,
      entityId,
    });
    
    // Return PDF as downloadable file
    const filename = `labels-sheet-${versionId}.pdf`;
    
    // Convert Buffer to Uint8Array for NextResponse
    const uint8Array = new Uint8Array(result.buffer);
    
    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': result.buffer.length.toString(),
        'Cache-Control': 'no-store',
        // Include metadata in custom headers for debugging
        'X-Page-Count': result.pageCount.toString(),
        'X-Labels-Per-Sheet': result.labelsPerSheet.toString(),
        'X-Total-Labels': result.totalLabels.toString(),
      },
    });
    
  } catch (error) {
    console.error('Sheet PDF generation error:', error);
    
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle specific error types
    if (message.includes('not found')) {
      return NextResponse.json(
        { error: 'Label version not found' },
        { status: 404 }
      );
    }
    
    if (message.includes('too large')) {
      return NextResponse.json(
        { error: message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: message },
      { status: 500 }
    );
  }
}


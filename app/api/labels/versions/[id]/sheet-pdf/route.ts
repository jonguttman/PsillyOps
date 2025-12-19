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

// Maximum labels to prevent abuse
const MAX_LABELS = 2000;

interface SheetPdfRequestBody {
  quantity: number;
  elements?: PlaceableElement[];
  labelWidthIn?: number | null;
  labelHeightIn?: number | null;
  decorations?: SheetDecorations;
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
    
    // Validate quantity
    const { quantity, elements, labelWidthIn, labelHeightIn, decorations } = body;
    
    if (typeof quantity !== 'number' || quantity < 1) {
      return NextResponse.json(
        { error: 'quantity must be a positive number' },
        { status: 400 }
      );
    }
    
    if (quantity > MAX_LABELS) {
      return NextResponse.json(
        { error: `quantity exceeds maximum of ${MAX_LABELS} labels` },
        { status: 400 }
      );
    }
    
    // Elements are validated by the service layer
    
    // Validate label dimensions if provided
    if (labelWidthIn !== undefined && labelWidthIn !== null) {
      if (typeof labelWidthIn !== 'number' || labelWidthIn <= 0 || labelWidthIn > 8.5) {
        return NextResponse.json(
          { error: 'labelWidthIn must be a positive number <= 8.5' },
          { status: 400 }
        );
      }
    }
    
    if (labelHeightIn !== undefined && labelHeightIn !== null) {
      if (typeof labelHeightIn !== 'number' || labelHeightIn <= 0 || labelHeightIn > 11) {
        return NextResponse.json(
          { error: 'labelHeightIn must be a positive number <= 11' },
          { status: 400 }
        );
      }
    }
    
    // Generate PDF
    const result = await renderSheetPdfBuffer({
      versionId,
      quantity,
      elements,
      labelWidthIn: labelWidthIn ?? undefined,
      labelHeightIn: labelHeightIn ?? undefined,
      decorations,
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


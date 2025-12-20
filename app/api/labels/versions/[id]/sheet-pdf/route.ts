/**
 * Sheet PDF Download API
 * 
 * POST /api/labels/versions/[id]/sheet-pdf
 * 
 * Generates a print-ready PDF of labels arranged on letter-size sheets.
 * 
 * Supports two modes:
 * - 'preview': Design-time preview with placeholder QR codes (no entity required)
 * - 'token': Production print with unique QR tokens per label (entity required)
 * 
 * The mode MUST be explicitly specified by the caller.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { renderSheetPdfBuffer, PdfRenderMode } from '@/lib/services/sheetPdfService';
import { PlaceableElement } from '@/lib/types/placement';
import { SheetDecorations } from '@/lib/constants/sheet';
import { LabelEntityType } from '@prisma/client';
import { 
  validateSheetConfig, 
  formatValidationError,
  DEFAULT_MARGIN_TOP_BOTTOM_IN,
} from '@/lib/utils/sheetValidation';

interface SheetPdfRequestBody {
  quantity: number;
  elements?: PlaceableElement[];
  labelWidthIn?: number | null;
  labelHeightIn?: number | null;
  decorations?: SheetDecorations;
  /**
   * PDF render mode - MUST be explicitly set
   * - 'preview': Label setup/editor preview, placeholder QR codes, no entity required
   * - 'token': Production print, unique QR tokens, entity required
   */
  mode: PdfRenderMode;
  // Entity info - REQUIRED when mode === 'token', ignored when mode === 'preview'
  entityType?: LabelEntityType;
  entityId?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authentication required - tokens are persisted with user audit trail
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
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
    
    const { quantity, elements, labelWidthIn, labelHeightIn, decorations, mode, entityType, entityId } = body;
    
    // Mode is REQUIRED - no silent defaults
    if (!mode || (mode !== 'preview' && mode !== 'token')) {
      return NextResponse.json(
        { error: `mode is required and must be either "preview" or "token". Received: ${mode}` },
        { status: 400 }
      );
    }
    
    // Mode-specific validation
    if (mode === 'token') {
      // Token mode REQUIRES entity context for QR token generation
      if (!entityType || !entityId) {
        return NextResponse.json(
          { error: 'Entity context (entityType and entityId) is required for production PDF generation. Please access this from a Product or Batch page.' },
          { status: 400 }
        );
      }
    }
    // Preview mode does NOT require entity context - that's the whole point
    
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
    
    // Generate PDF based on mode
    const result = await renderSheetPdfBuffer({
      versionId,
      quantity: validation.clampedQuantity,
      labelWidthIn: effectiveLabelWidth,
      labelHeightIn: effectiveLabelHeight,
      decorations,
      mode,
      entityType,
      entityId,
      userId: mode === 'token' ? session.user.id : undefined,
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


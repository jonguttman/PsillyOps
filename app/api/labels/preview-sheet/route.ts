import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { renderLetterSheetPreview } from '@/lib/services/labelService';
import { handleApiError } from '@/lib/utils/errors';
import { PlaceableElement } from '@/lib/types/placement';
import { SheetDecorations, DEFAULT_SHEET_DECORATIONS } from '@/lib/constants/sheet';

/**
 * POST /api/labels/preview-sheet
 * 
 * Render a letter-size sheet preview with metadata (Unified Placement Model)
 * 
 * Request body:
 * - versionId: string (required)
 * - quantity: number (default: 1)
 * - elements?: PlaceableElement[] (optional override for live preview)
 * - labelWidthIn?: number (optional size override, render-time only)
 * - labelHeightIn?: number (optional size override, render-time only)
 * - orientation?: 'portrait' | 'landscape' (default: 'portrait')
 * - marginIn?: number (default: 0.25)
 * - format?: 'json' | 'svg' (default: 'json')
 * 
 * Response (format=json):
 * {
 *   svg: string,
 *   sheetMeta: { columns, rows, perSheet, rotationUsed, totalSheets },
 *   labelMeta: { widthIn, heightIn, elements }
 * }
 * 
 * Response (format=svg):
 * Raw SVG content with X-Label-* headers for metadata
 * 
 * Note: Label size override is treated as a layout instruction applied at render time.
 * The original SVG remains unchanged in storage.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { versionId, quantity, elements, labelWidthIn, labelHeightIn, orientation, marginIn, decorations, format = 'json', entityType, entityId } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: 'versionId is required' },
        { status: 400 }
      );
    }

    // Parse elements override
    let parsedElements: PlaceableElement[] | undefined;
    if (elements !== undefined && Array.isArray(elements)) {
      parsedElements = elements as PlaceableElement[];
    }

    // Parse label size overrides (render-time only, non-destructive)
    let parsedLabelWidthIn: number | undefined;
    if (labelWidthIn !== undefined) {
      const w = parseFloat(labelWidthIn);
      if (!isNaN(w) && w > 0 && w <= 20) parsedLabelWidthIn = w;
    }

    let parsedLabelHeightIn: number | undefined;
    if (labelHeightIn !== undefined) {
      const h = parseFloat(labelHeightIn);
      if (!isNaN(h) && h > 0 && h <= 20) parsedLabelHeightIn = h;
    }

    // Parse orientation
    const parsedOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
    
    // Parse margin
    let parsedMarginIn: number | undefined;
    if (marginIn !== undefined) {
      const m = parseFloat(marginIn);
      if (!isNaN(m) && m >= 0 && m <= 1) parsedMarginIn = m;
    }

    // Parse decorations
    let parsedDecorations: SheetDecorations = { ...DEFAULT_SHEET_DECORATIONS };
    if (decorations && typeof decorations === 'object') {
      if (typeof decorations.showFooter === 'boolean') {
        parsedDecorations.showFooter = decorations.showFooter;
      }
      if (typeof decorations.productName === 'string') {
        parsedDecorations.productName = decorations.productName;
      }
      if (typeof decorations.versionLabel === 'string') {
        parsedDecorations.versionLabel = decorations.versionLabel;
      }
      if (typeof decorations.footerNotes === 'string') {
        parsedDecorations.footerNotes = decorations.footerNotes;
      }
      if (typeof decorations.showRegistrationMarks === 'boolean') {
        parsedDecorations.showRegistrationMarks = decorations.showRegistrationMarks;
      }
      if (typeof decorations.showCenterCrosshair === 'boolean') {
        parsedDecorations.showCenterCrosshair = decorations.showCenterCrosshair;
      }
    }

    const result = await renderLetterSheetPreview({
      versionId,
      quantity: parseInt(quantity, 10) || 1,
      elements: parsedElements,
      labelWidthIn: parsedLabelWidthIn,
      labelHeightIn: parsedLabelHeightIn,
      orientation: parsedOrientation,
      marginIn: parsedMarginIn,
      decorations: parsedDecorations,
      // Pass entity info for barcode rendering (product.barcodeValue ?? product.sku)
      entityType: entityType as 'PRODUCT' | 'BATCH' | 'INVENTORY' | 'CUSTOM' | undefined,
      entityId: entityId as string | undefined,
    });

    // Support legacy format=svg for backwards compatibility
    if (format === 'svg') {
      return new NextResponse(result.svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'X-Label-Columns': String(result.meta.columns),
          'X-Label-Rows': String(result.meta.rows),
          'X-Label-Per-Sheet': String(result.meta.perSheet),
          'X-Label-Rotation-Used': String(result.meta.rotationUsed),
          'X-Label-Total-Sheets': String(result.meta.totalSheets),
          'X-Label-Width-In': String(result.labelMeta.widthIn),
          'X-Label-Height-In': String(result.labelMeta.heightIn)
        }
      });
    }

    // Default: return JSON with SVG and all metadata
    return NextResponse.json({
      svg: result.svg,
      sheetMeta: result.meta,
      labelMeta: result.labelMeta
    });
  } catch (error) {
    return handleApiError(error);
  }
}

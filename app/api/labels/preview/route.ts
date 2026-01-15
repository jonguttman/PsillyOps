import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { renderLabelPreviewWithMeta } from '@/lib/services/labelService';
import { handleApiError } from '@/lib/utils/errors';
import { PlaceableElement } from '@/lib/types/placement';

/**
 * POST /api/labels/preview
 * 
 * Render a label preview with metadata (Unified Placement Model)
 * 
 * Request body:
 * - versionId: string (required)
 * - elements?: PlaceableElement[] (optional override for live preview)
 * - labelWidthIn?: number (optional size override)
 * - labelHeightIn?: number (optional size override)
 * - format?: 'json' | 'svg' (default: 'json')
 * 
 * Response (format=json):
 * {
 *   svg: string,
 *   meta: {
 *     widthIn: number,
 *     heightIn: number,
 *     elements: PlaceableElement[]
 *   }
 * }
 * 
 * Response (format=svg):
 * Raw SVG content with Content-Type: image/svg+xml
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
    const { versionId, elements, labelWidthIn, labelHeightIn, format = 'json' } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: 'versionId is required' },
        { status: 400 }
      );
    }

    // Build overrides object for live preview
    const overrides: { 
      elements?: PlaceableElement[];
      labelWidthIn?: number;
      labelHeightIn?: number;
    } = {};
    
    // Elements override for live preview
    if (elements !== undefined && Array.isArray(elements)) {
      overrides.elements = elements as PlaceableElement[];
    }

    // Label size override (render-time only, non-destructive)
    if (labelWidthIn !== undefined) {
      const parsedWidth = parseFloat(labelWidthIn);
      if (!isNaN(parsedWidth) && parsedWidth > 0 && parsedWidth <= 20) {
        overrides.labelWidthIn = parsedWidth;
      }
    }

    if (labelHeightIn !== undefined) {
      const parsedHeight = parseFloat(labelHeightIn);
      if (!isNaN(parsedHeight) && parsedHeight > 0 && parsedHeight <= 20) {
        overrides.labelHeightIn = parsedHeight;
      }
    }

    const result = await renderLabelPreviewWithMeta(
      versionId, 
      Object.keys(overrides).length > 0 ? overrides : undefined
    );

    // Support legacy format=svg for backwards compatibility
    if (format === 'svg') {
      return new NextResponse(result.svg, {
        headers: { 'Content-Type': 'image/svg+xml' }
      });
    }

    // Default: return JSON with both SVG and metadata
    return NextResponse.json(result);
  } catch (error) {
    // Log error for Vercel function logs
    console.error('[PREVIEW_ERROR]', {
      error: String(error),
      stack: (error as Error)?.stack,
      timestamp: new Date().toISOString()
    });
    return handleApiError(error);
  }
}

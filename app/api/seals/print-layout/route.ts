/**
 * Seal Print Layout API
 * 
 * POST /api/seals/print-layout
 * - Creates a print job and returns PDF
 * 
 * POST /api/seals/print-layout/preview
 * - Preview layout without creating job
 * 
 * GET /api/seals/print-layout/sheets
 * - Get printable seal sheets
 * 
 * PRODUCTION SYSTEM - This generates real, scannable seals.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import {
  createPrintJob,
  previewPrintLayout,
  getPrintableSheets,
  type SealPrintJobConfig,
} from '@/lib/services/sealPrintLayoutService';
import { handleApiError } from '@/lib/utils/errors';
import type { PaperType, SealSizeIn } from '@/lib/utils/sealPrintLayout';
import { SEAL_SIZES_IN, SPACING_MIN_IN, SPACING_MAX_IN } from '@/lib/utils/sealPrintLayout';

// ========================================
// REQUEST VALIDATION
// ========================================

interface PrintLayoutRequestBody {
  sealSheetId: string;
  sealDiameterIn: number;
  spacingIn: number;
  paperType: string;
  customWidthIn?: number;
  customHeightIn?: number;
  marginIn?: number;
  sealCount?: number;
  includeCutGuides?: boolean;
  includeRegistrationMarks?: boolean;
}

function validatePrintLayoutRequest(body: unknown): PrintLayoutRequestBody {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body is required');
  }

  const data = body as Record<string, unknown>;

  // Required fields
  if (!data.sealSheetId || typeof data.sealSheetId !== 'string') {
    throw new Error('sealSheetId is required');
  }

  if (typeof data.sealDiameterIn !== 'number') {
    throw new Error('sealDiameterIn is required');
  }

  if (!SEAL_SIZES_IN.includes(data.sealDiameterIn as SealSizeIn)) {
    throw new Error(`sealDiameterIn must be one of: ${SEAL_SIZES_IN.join(', ')}`);
  }

  if (typeof data.spacingIn !== 'number') {
    throw new Error('spacingIn is required');
  }

  if (data.spacingIn < SPACING_MIN_IN || data.spacingIn > SPACING_MAX_IN) {
    throw new Error(`spacingIn must be between ${SPACING_MIN_IN} and ${SPACING_MAX_IN}`);
  }

  if (!data.paperType || typeof data.paperType !== 'string') {
    throw new Error('paperType is required');
  }

  const validPaperTypes = ['LETTER', 'A4', 'CUSTOM'];
  if (!validPaperTypes.includes(data.paperType)) {
    throw new Error(`paperType must be one of: ${validPaperTypes.join(', ')}`);
  }

  if (data.paperType === 'CUSTOM') {
    if (typeof data.customWidthIn !== 'number' || data.customWidthIn <= 0) {
      throw new Error('customWidthIn is required for CUSTOM paper type');
    }
    if (typeof data.customHeightIn !== 'number' || data.customHeightIn <= 0) {
      throw new Error('customHeightIn is required for CUSTOM paper type');
    }
  }

  return {
    sealSheetId: data.sealSheetId,
    sealDiameterIn: data.sealDiameterIn,
    spacingIn: data.spacingIn,
    paperType: data.paperType,
    customWidthIn: data.customWidthIn as number | undefined,
    customHeightIn: data.customHeightIn as number | undefined,
    marginIn: data.marginIn as number | undefined,
    sealCount: data.sealCount as number | undefined,
    includeCutGuides: data.includeCutGuides as boolean | undefined,
    includeRegistrationMarks: data.includeRegistrationMarks as boolean | undefined,
  };
}

// ========================================
// POST /api/seals/print-layout
// Create print job and return PDF
// ========================================

export async function POST(request: NextRequest) {
  try {
    // Check for preview mode via query param
    const { searchParams } = new URL(request.url);
    const isPreview = searchParams.get('preview') === 'true';

    // Authentication required
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Permission check: ADMIN or WAREHOUSE only
    const userRole = session.user.role;
    if (userRole !== 'ADMIN' && userRole !== 'WAREHOUSE') {
      return NextResponse.json(
        { error: 'Insufficient permissions. ADMIN or WAREHOUSE role required.' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    let body: PrintLayoutRequestBody;
    try {
      const rawBody = await request.json();
      body = validatePrintLayoutRequest(rawBody);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid request body' },
        { status: 400 }
      );
    }

    // Build config
    const config: SealPrintJobConfig = {
      sealSheetId: body.sealSheetId,
      sealDiameterIn: body.sealDiameterIn as SealSizeIn,
      spacingIn: body.spacingIn,
      paperType: body.paperType as PaperType,
      customWidthIn: body.customWidthIn,
      customHeightIn: body.customHeightIn,
      marginIn: body.marginIn,
      sealCount: body.sealCount,
      includeCutGuides: body.includeCutGuides,
      includeRegistrationMarks: body.includeRegistrationMarks,
    };

    // Preview mode: return layout info without creating job
    if (isPreview) {
      const preview = await previewPrintLayout(config);
      return NextResponse.json(preview);
    }

    // Production mode: create job and return PDF
    const result = await createPrintJob(config, session.user.id);

    // Return PDF as downloadable file
    const filename = `seals-${result.jobId}-${Date.now()}.pdf`;
    
    // Convert Buffer to Uint8Array for NextResponse
    const uint8Array = new Uint8Array(result.pdfBuffer);
    
    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Print-Job-Id': result.jobId,
        'X-Seal-Count': result.sealCount.toString(),
        'X-Page-Count': result.pageCount.toString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ========================================
// GET /api/seals/print-layout
// Get printable seal sheets
// ========================================

export async function GET(request: NextRequest) {
  try {
    // Authentication required
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Permission check: ADMIN or WAREHOUSE only
    const userRole = session.user.role;
    if (userRole !== 'ADMIN' && userRole !== 'WAREHOUSE') {
      return NextResponse.json(
        { error: 'Insufficient permissions. ADMIN or WAREHOUSE role required.' },
        { status: 403 }
      );
    }

    // Get unassigned sheets from last 10 days
    const sheets = await getPrintableSheets();

    return NextResponse.json({
      sheets,
      count: sheets.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}


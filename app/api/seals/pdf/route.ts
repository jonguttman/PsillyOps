/**
 * Seal PDF Generation API
 * 
 * POST /api/seals/pdf
 * 
 * Generates a print-ready PDF of seals arranged on sheets.
 * On-demand PDF generation (SVGs are cached, PDFs are ephemeral).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { generateSealBatch } from '@/lib/services/sealBatchService';
import { renderSvgToPng, createPdfFromPngs } from '@/lib/services/sheetPdfService';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';
import { SEAL_VERSION, SHEET_LAYOUT_VERSION } from '@/lib/constants/seal';
import type { SealSheetConfig } from '@/lib/services/sealSheetService';
import { DEFAULT_SHEET_DECORATIONS } from '@/lib/constants/sheet';

interface SealPdfRequestBody {
  tokens: string[];
  sheetConfig: SealSheetConfig;
}

export async function POST(request: NextRequest) {
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

    // Parse request body
    let body: SealPdfRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { tokens, sheetConfig } = body;

    // Validation
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json(
        { error: 'tokens array is required and must contain at least one token' },
        { status: 400 }
      );
    }

    if (!sheetConfig) {
      return NextResponse.json(
        { error: 'sheetConfig is required' },
        { status: 400 }
      );
    }

    // Set default decorations if not provided
    const config: SealSheetConfig = {
      ...sheetConfig,
      decorations: sheetConfig.decorations || DEFAULT_SHEET_DECORATIONS,
    };

    // Sort tokens deterministically for idempotent PDF generation
    // Same token list + config should always produce identical PDF bytes
    const sortedTokens = [...tokens].sort();

    // Generate seals and sheets (batch service also sorts, but we sort here too for API-level idempotency)
    const result = await generateSealBatch({
      tokens: sortedTokens,
      sheetConfig: config,
      userId: session.user.id,
    });

    // Convert sheet SVGs to PNGs (reuse existing PDF service logic)
    const pngBuffers: Buffer[] = [];
    for (const sheetSvg of result.sheetSvgs) {
      const pngBuffer = renderSvgToPng(sheetSvg);
      pngBuffers.push(pngBuffer);
    }

    // Create PDF from PNGs
    const pdfBuffer = await createPdfFromPngs(pngBuffers);

    // Log PDF generation with full generation parameters for idempotency audit
    const batchId = `pdf_${Date.now()}`;
    await logAction({
      entityType: ActivityEntity.LABEL,
      entityId: batchId,
      action: 'seal_pdf_generated',
      userId: session.user.id,
      summary: `Seal PDF generated: ${result.metadata.tokenCount} seals, ${result.pageCount} pages`,
      metadata: {
        tokenCount: result.metadata.tokenCount,
        sealVersion: result.metadata.sealVersion,
        sheetLayoutVersion: result.metadata.sheetLayoutVersion,
        tokensHash: result.metadata.tokensHash,  // Deterministic hash for idempotency verification
        sheetConfig: {
          paperSize: config.paperSize,
          sealDiameter: config.sealDiameter,
          marginIn: config.marginIn,
          decorations: config.decorations,
        },
        logCategory: 'certification',
        pageCount: result.pageCount,
        sealsPerSheet: result.sealsPerSheet,
        layout: result.layout,
        generator: 'sealGeneratorService',
        // Full config logged for idempotency: same inputs → same PDF bytes
      },
      tags: ['seal', 'tripdar', 'pdf', 'generation', 'certification']
    });

    // Return PDF as downloadable file
    const filename = `seals-${Date.now()}.pdf`;
    const uint8Array = new Uint8Array(pdfBuffer);
    
    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[Seal PDF] Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { 
          success: false, 
          error: error.message 
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'An unexpected error occurred' 
      },
      { status: 500 }
    );
  }
}


/**
 * Seal PDF Generation API
 * 
 * POST /api/seals/pdf
 * 
 * Supports two modes:
 * 1. Generate new seals: { quantity, productId?, config }
 *    - Creates new QR tokens automatically
 *    - Optionally links to a product for tracking
 * 
 * 2. Use existing tokens: { tokens[], config }
 *    - Uses pre-existing QR tokens
 *    - Tokens must already exist in the database
 * 
 * Generates a print-ready PDF of seals arranged on sheets.
 * On-demand PDF generation (SVGs are cached, PDFs are ephemeral).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { generateSealBatch } from '@/lib/services/sealBatchService';
import { renderSvgToPng, createPdfFromPngs } from '@/lib/services/sheetPdfService';
import { logAction } from '@/lib/services/loggingService';
import { createTokenBatch } from '@/lib/services/qrTokenService';
import { ActivityEntity, LabelEntityType } from '@prisma/client';
import { MAX_TOKENS_PER_BATCH } from '@/lib/constants/seal';
import type { SealSheetConfig } from '@/lib/services/sealSheetService';
import { DEFAULT_SHEET_DECORATIONS } from '@/lib/constants/sheet';
import { prisma } from '@/lib/db/prisma';

interface SealPdfRequestBody {
  // Mode 1: Generate new seals
  quantity?: number;
  productId?: string;
  
  // Mode 2: Use existing tokens
  tokens?: string[];
  
  // Shared config
  config: SealSheetConfig;
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

    const { quantity, productId, tokens: existingTokens, config: sheetConfig } = body;

    // Validate config
    if (!sheetConfig) {
      return NextResponse.json(
        { error: 'config is required' },
        { status: 400 }
      );
    }

    // Determine mode and get tokens
    let tokens: string[];
    let tokensCreated = false;
    
    if (quantity !== undefined && quantity > 0) {
      // Mode 1: Generate new tokens
      if (quantity > MAX_TOKENS_PER_BATCH) {
        return NextResponse.json(
          { error: `Maximum ${MAX_TOKENS_PER_BATCH} seals allowed per batch` },
          { status: 400 }
        );
      }

      // Determine entity type and ID
      let entityType: LabelEntityType = 'CUSTOM';
      let entityId = `tripdar-seal-batch-${Date.now()}`;
      
      if (productId) {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: { id: true, name: true }
        });
        
        if (!product) {
          return NextResponse.json(
            { error: 'Product not found' },
            { status: 400 }
          );
        }
        
        entityType = 'PRODUCT';
        entityId = productId;
      }

      // Create tokens
      const createdTokens = await createTokenBatch({
        entityType,
        entityId,
        quantity,
        userId: session.user.id,
      });

      tokens = createdTokens.map(t => t.token);
      tokensCreated = true;

      // Log token creation
      await logAction({
        entityType: ActivityEntity.LABEL,
        entityId,
        action: 'seal_tokens_created',
        userId: session.user.id,
        summary: `Created ${quantity} TripDAR seal tokens for PDF`,
        metadata: {
          quantity,
          entityType,
          entityId,
          productId: productId || null,
          logCategory: 'certification',
        },
        tags: ['seal', 'tripdar', 'token_creation', 'pdf'],
      });

    } else if (existingTokens && Array.isArray(existingTokens) && existingTokens.length > 0) {
      // Mode 2: Use existing tokens
      if (existingTokens.length > MAX_TOKENS_PER_BATCH) {
        return NextResponse.json(
          { error: `Maximum ${MAX_TOKENS_PER_BATCH} tokens allowed per batch` },
          { status: 400 }
        );
      }

      // Verify all tokens exist
      const tokenRecords = await prisma.qRToken.findMany({
        where: {
          token: {
            in: existingTokens,
          },
        },
      });

      if (tokenRecords.length !== existingTokens.length) {
        const foundTokens = new Set(tokenRecords.map((t) => t.token));
        const missingTokens = existingTokens.filter((t) => !foundTokens.has(t));
        return NextResponse.json(
          {
            error: `Some tokens not found: ${missingTokens.slice(0, 5).join(', ')}${missingTokens.length > 5 ? ` and ${missingTokens.length - 5} more` : ''}`,
          },
          { status: 400 }
        );
      }

      tokens = existingTokens;
    } else {
      return NextResponse.json(
        { error: 'Either quantity (for new seals) or tokens array (for existing) is required' },
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

    // Create SealSheet record (if tokens were created)
    let sheetId: string | undefined;
    if (tokensCreated) {
      const sealSheet = await prisma.sealSheet.create({
        data: {
          sealVersion: result.metadata.sealVersion,
          status: 'UNASSIGNED',
          tokenCount: result.metadata.tokenCount,
          tokensHash: result.metadata.tokensHash,
          createdById: session.user.id,
        },
      });
      sheetId = sealSheet.id;

      // Link tokens to sheet and add metadata
      await prisma.qRToken.updateMany({
        where: {
          token: {
            in: sortedTokens,
          },
        },
        data: {
          sealSheetId: sealSheet.id,
          metadata: {
            sealVersion: result.metadata.sealVersion,
            bindingState: 'UNBOUND',
            issuedAs: 'TRIPDAR_SEAL',
          },
        },
      });
    }

    // Convert sheet SVGs to PNGs (reuse existing PDF service logic)
    const pngBuffers: Buffer[] = [];
    for (const sheetSvg of result.sheetSvgs) {
      const pngBuffer = renderSvgToPng(sheetSvg);
      pngBuffers.push(pngBuffer);
    }

    // Create PDF from PNGs
    const pdfBuffer = await createPdfFromPngs(pngBuffers);

    // Log PDF generation with full generation parameters for idempotency audit
    const batchId = sheetId || `pdf_${Date.now()}`;
    await logAction({
      entityType: ActivityEntity.LABEL,
      entityId: batchId,
      action: 'seal_pdf_generated',
      userId: session.user.id,
      summary: `Seal PDF generated: ${result.metadata.tokenCount} seals, ${result.pageCount} pages${tokensCreated ? ' (new tokens)' : ''}`,
      metadata: {
        tokenCount: result.metadata.tokenCount,
        tokensCreated,
        sheetId: sheetId || null,
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

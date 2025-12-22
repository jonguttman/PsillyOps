/**
 * Seal Generation API
 * 
 * POST /api/seals/generate
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
 * Returns individual seal SVGs and composed sheet SVGs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { generateSealBatch } from '@/lib/services/sealBatchService';
import { logAction } from '@/lib/services/loggingService';
import { createTokenBatch } from '@/lib/services/qrTokenService';
import { ActivityEntity, LabelEntityType } from '@prisma/client';
import { MAX_TOKENS_PER_BATCH } from '@/lib/constants/seal';
import type { SealSheetConfig } from '@/lib/services/sealSheetService';
import { DEFAULT_SHEET_DECORATIONS } from '@/lib/constants/sheet';
import { prisma } from '@/lib/db/prisma';

interface GenerateSealsRequestBody {
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
    let body: GenerateSealsRequestBody;
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
        summary: `Created ${quantity} TripDAR seal tokens`,
        metadata: {
          quantity,
          entityType,
          entityId,
          productId: productId || null,
          logCategory: 'certification',
        },
        tags: ['seal', 'tripdar', 'token_creation'],
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

    // Generate seals
    const result = await generateSealBatch({
      tokens,
      sheetConfig: config,
      userId: session.user.id,
    });

    // Create SealSheet record
    const sealSheet = await prisma.sealSheet.create({
      data: {
        sealVersion: result.metadata.sealVersion,
        status: 'UNASSIGNED',
        tokenCount: result.metadata.tokenCount,
        tokensHash: result.metadata.tokensHash,
        createdById: session.user.id,
      },
    });

    // Link tokens to sheet and add metadata
    await prisma.qRToken.updateMany({
      where: {
        token: {
          in: tokens,
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

    // Log generation event with full metadata for audit
    await logAction({
      entityType: ActivityEntity.LABEL,
      entityId: sealSheet.id,
      action: 'seal_sheet_created',
      userId: session.user.id,
      summary: `Seal sheet created: ${result.metadata.tokenCount} seals${tokensCreated ? ' (new tokens)' : ' (existing tokens)'}`,
      metadata: {
        sheetId: sealSheet.id,
        tokenCount: result.metadata.tokenCount,
        tokensCreated,
        sealVersion: result.metadata.sealVersion,
        sheetLayoutVersion: result.metadata.sheetLayoutVersion,
        tokensHash: result.metadata.tokensHash,
        sheetConfig: config,
        logCategory: 'certification',
        pageCount: result.pageCount,
        sealsPerSheet: result.sealsPerSheet,
        layout: result.layout,
        generator: 'sealGeneratorService',
      },
      tags: ['seal', 'tripdar', 'generation', 'certification', 'sheet_created'],
    });

    return NextResponse.json({
      success: true,
      sealSvgs: result.sealSvgs,
      sheetSvgs: result.sheetSvgs,
      pageCount: result.pageCount,
      sealsPerSheet: result.sealsPerSheet,
      layout: result.layout,
      sheetId: sealSheet.id,
      tokensCreated,
      metadata: {
        sealVersion: result.metadata.sealVersion,
        sheetLayoutVersion: result.metadata.sheetLayoutVersion,
        tokenCount: result.metadata.tokenCount,
      },
    });
  } catch (error) {
    console.error('[Seal Generation] Error:', error);
    
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

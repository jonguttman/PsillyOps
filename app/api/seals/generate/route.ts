/**
 * Seal Generation API
 * 
 * POST /api/seals/generate
 * 
 * Generates seal SVGs for given tokens.
 * Returns individual seal SVGs and composed sheet SVGs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { generateSealBatch } from '@/lib/services/sealBatchService';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';
import { SEAL_VERSION, SHEET_LAYOUT_VERSION } from '@/lib/constants/seal';
import type { SealSheetConfig } from '@/lib/services/sealSheetService';
import { DEFAULT_SHEET_DECORATIONS } from '@/lib/constants/sheet';
import { prisma } from '@/lib/db/prisma';

interface GenerateSealsRequestBody {
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
    let body: GenerateSealsRequestBody;
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

    // Generate seals
    const result = await generateSealBatch({
      tokens,
      sheetConfig: config,
      userId: session.user.id,
    });

    // Phase 2B: Create SealSheet record and link tokens
    // Look up QRToken records by token values
    const tokenRecords = await prisma.qRToken.findMany({
      where: {
        token: {
          in: tokens,
        },
      },
    });

    if (tokenRecords.length !== tokens.length) {
      const foundTokens = new Set(tokenRecords.map((t) => t.token));
      const missingTokens = tokens.filter((t) => !foundTokens.has(t));
      return NextResponse.json(
        {
          error: `Some tokens not found: ${missingTokens.join(', ')}`,
        },
        { status: 400 }
      );
    }

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
      summary: `Seal sheet created: ${result.metadata.tokenCount} seals`,
      metadata: {
        sheetId: sealSheet.id,
        tokenCount: result.metadata.tokenCount,
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


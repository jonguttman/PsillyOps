/**
 * Seal Print Layout Service
 * 
 * Production seal printing service that:
 * - Consumes existing seal inventory (SealSheet → QRToken)
 * - Computes optimal grid layouts
 * - Generates print-ready PDFs with audit trail
 * 
 * PRODUCTION SYSTEM - Not for design proofing.
 * This service creates real, scannable, inventory-bound seals.
 * 
 * INVARIANTS:
 * - Never generates new QR tokens (consumes existing inventory)
 * - Same config = same PDF (deterministic)
 * - Full audit trail via PrintJob records
 * - Uses existing registration mark system from labelService
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { ActivityEntity, SealSheetStatus, QRTokenStatus } from '@prisma/client';
import type { SealSheetConfig } from './sealSheetService';
import {
  calculateGridLayout,
  calculateSealPositions,
  calculateSheetCount,
  validatePrintLayoutConfig,
  getPaperDimensions,
  type PrintLayoutConfig,
  type GridLayout,
  type SealPosition,
  type PaperType,
  type SealSizeIn,
  SEAL_SIZES_IN,
  DEFAULT_MARGIN_IN,
  DEFAULT_SPACING_IN,
} from '@/lib/utils/sealPrintLayout';

// ========================================
// TYPES
// ========================================

export interface SealPrintJobConfig {
  /** SealSheet ID to print from */
  sealSheetId: string;
  /** Seal diameter in inches */
  sealDiameterIn: SealSizeIn;
  /** Edge-to-edge spacing in inches */
  spacingIn: number;
  /** Paper type */
  paperType: PaperType;
  /** Custom paper width (required if paperType === 'CUSTOM') */
  customWidthIn?: number;
  /** Custom paper height (required if paperType === 'CUSTOM') */
  customHeightIn?: number;
  /** Page margin in inches */
  marginIn?: number;
  /** Number of seals to print (default: fill available) */
  sealCount?: number;
  /** Include cut guides */
  includeCutGuides?: boolean;
  /** Include registration marks */
  includeRegistrationMarks?: boolean;
}

export interface SealPrintJobResult {
  /** Print job ID */
  jobId: string;
  /** Computed layout */
  layout: GridLayout;
  /** Number of pages in PDF */
  pageCount: number;
  /** Total seals printed */
  sealCount: number;
  /** Token IDs that were printed */
  tokenIds: string[];
  /** PDF buffer */
  pdfBuffer: Buffer;
}

export interface PrintableSheet {
  /** Sheet ID */
  id: string;
  /** Partner name (if assigned) */
  partnerName: string | null;
  /** Partner ID (if assigned) */
  partnerId: string | null;
  /** Total tokens on sheet */
  tokenCount: number;
  /** Tokens already printed */
  printedCount: number;
  /** Tokens remaining to print */
  remainingCount: number;
  /** Sheet status */
  status: SealSheetStatus;
  /** Creation date */
  createdAt: Date;
  /** Seal version */
  sealVersion: string;
}

export interface LayoutPreview {
  /** Grid layout */
  layout: GridLayout;
  /** Number of pages needed */
  pageCount: number;
  /** Seals that will be printed */
  sealCount: number;
  /** Seals remaining after this print */
  remainingAfterPrint: number;
  /** Validation errors (empty if valid) */
  errors: string[];
}

// ========================================
// SHEET QUERIES
// ========================================

/**
 * Get printable seal sheets.
 * 
 * Returns sheets that:
 * - Are UNASSIGNED only (not ASSIGNED or REVOKED)
 * - Were created in the last 10 days
 * - Have tokens available
 * - Sorted by creation date, most recent first
 * 
 * NOTE: Printing is idempotent and read-only. The same sheet can be
 * printed multiple times without changing token state.
 */
export async function getPrintableSheets(): Promise<PrintableSheet[]> {
  // Calculate 10 days ago
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  
  const sheets = await prisma.sealSheet.findMany({
    where: {
      status: SealSheetStatus.UNASSIGNED,
      createdAt: {
        gte: tenDaysAgo,
      },
    },
    include: {
      partner: {
        select: {
          id: true,
          name: true,
        },
      },
      tokens: {
        select: {
          id: true,
          status: true,
          metadata: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return sheets.map((sheet) => {
    // Count printed tokens by checking metadata.printedAt
    const printedCount = sheet.tokens.filter((t) => {
      const metadata = t.metadata as Record<string, unknown> | null;
      return metadata?.printedAt != null;
    }).length;

    return {
      id: sheet.id,
      partnerName: sheet.partner?.name ?? null,
      partnerId: sheet.partner?.id ?? null,
      tokenCount: sheet.tokenCount,
      printedCount,
      remainingCount: sheet.tokenCount - printedCount,
      status: sheet.status,
      createdAt: sheet.createdAt,
      sealVersion: sheet.sealVersion,
    };
  }).filter((sheet) => sheet.remainingCount > 0); // Only return sheets with remaining tokens
}

/**
 * Get tokens from a sheet that haven't been printed yet.
 */
export async function getUnprintedTokens(
  sealSheetId: string,
  limit?: number
): Promise<{ id: string; token: string }[]> {
  const sheet = await prisma.sealSheet.findUnique({
    where: { id: sealSheetId },
    include: {
      tokens: {
        where: {
          status: QRTokenStatus.ACTIVE,
        },
        orderBy: {
          printedAt: 'asc', // Oldest first (deterministic order)
        },
        select: {
          id: true,
          token: true,
          metadata: true,
        },
      },
    },
  });

  if (!sheet) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Seal sheet not found');
  }

  // Filter to tokens that haven't been printed
  const unprintedTokens = sheet.tokens.filter((t) => {
    const metadata = t.metadata as Record<string, unknown> | null;
    return metadata?.printedAt == null;
  });

  // Apply limit if specified
  const tokens = limit ? unprintedTokens.slice(0, limit) : unprintedTokens;

  return tokens.map((t) => ({ id: t.id, token: t.token }));
}

// ========================================
// LAYOUT PREVIEW
// ========================================

/**
 * Preview a print layout without creating a job.
 * 
 * Use this for the live preview in the UI.
 */
export async function previewPrintLayout(
  config: SealPrintJobConfig
): Promise<LayoutPreview> {
  // Get paper dimensions
  const paper = getPaperDimensions(
    config.paperType,
    config.customWidthIn,
    config.customHeightIn
  );

  // Build layout config
  const layoutConfig: PrintLayoutConfig = {
    sealDiameterIn: config.sealDiameterIn,
    spacingIn: config.spacingIn,
    paper,
    marginIn: config.marginIn ?? DEFAULT_MARGIN_IN,
  };

  // Validate config
  const errors = validatePrintLayoutConfig(layoutConfig);
  if (errors.length > 0) {
    return {
      layout: {
        columns: 0,
        rows: 0,
        sealsPerSheet: 0,
        cellSizeIn: 0,
        gridOffsetXIn: 0,
        gridOffsetYIn: 0,
        usableWidthIn: 0,
        usableHeightIn: 0,
      },
      pageCount: 0,
      sealCount: 0,
      remainingAfterPrint: 0,
      errors,
    };
  }

  // Calculate layout
  const layout = calculateGridLayout(layoutConfig);

  // Get available tokens
  const unprintedTokens = await getUnprintedTokens(config.sealSheetId);
  const availableCount = unprintedTokens.length;

  // Determine how many seals to print
  const requestedCount = config.sealCount ?? availableCount;
  const sealCount = Math.min(requestedCount, availableCount);

  // Calculate pages needed
  const pageCount = calculateSheetCount(sealCount, layout.sealsPerSheet);

  return {
    layout,
    pageCount,
    sealCount,
    remainingAfterPrint: availableCount - sealCount,
    errors: [],
  };
}

// ========================================
// PRINT JOB CREATION
// ========================================

/**
 * Create a print job and generate PDF.
 * 
 * This is the main entry point for production printing.
 * 
 * Flow:
 * 1. Validate config and sheet
 * 2. Reserve tokens (mark as RESERVED)
 * 3. Generate seal SVGs
 * 4. Compose sheet layout
 * 5. Generate PDF
 * 6. Create PrintJob record
 * 7. Mark tokens as PRINTED
 * 
 * If any step fails, tokens are released back to UNUSED state.
 */
export async function createPrintJob(
  config: SealPrintJobConfig,
  userId: string
): Promise<SealPrintJobResult> {
  // Get paper dimensions
  const paper = getPaperDimensions(
    config.paperType,
    config.customWidthIn,
    config.customHeightIn
  );

  // Build layout config
  const layoutConfig: PrintLayoutConfig = {
    sealDiameterIn: config.sealDiameterIn,
    spacingIn: config.spacingIn,
    paper,
    marginIn: config.marginIn ?? DEFAULT_MARGIN_IN,
  };

  // Validate config
  const errors = validatePrintLayoutConfig(layoutConfig);
  if (errors.length > 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, errors.join('; '));
  }

  // Calculate layout
  const layout = calculateGridLayout(layoutConfig);

  // Get sheet and verify it's printable
  const sheet = await prisma.sealSheet.findUnique({
    where: { id: config.sealSheetId },
    include: {
      partner: true,
    },
  });

  if (!sheet) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Seal sheet not found');
  }

  // Allow printing UNASSIGNED or ASSIGNED sheets (not REVOKED)
  if (sheet.status === SealSheetStatus.REVOKED) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Cannot print from a revoked sheet'
    );
  }

  // Get unprinted tokens
  const unprintedTokens = await getUnprintedTokens(config.sealSheetId);
  const availableCount = unprintedTokens.length;

  if (availableCount === 0) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'No unprinted tokens remaining on this sheet'
    );
  }

  // Determine how many seals to print
  const requestedCount = config.sealCount ?? availableCount;
  const sealCount = Math.min(requestedCount, availableCount);

  if (sealCount === 0) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'No seals to print'
    );
  }

  // Select tokens to print (deterministic order)
  const tokensToPrint = unprintedTokens.slice(0, sealCount);
  const tokenIds = tokensToPrint.map((t) => t.id);

  // Calculate pages needed
  const pageCount = calculateSheetCount(sealCount, layout.sealsPerSheet);

  // Generate PDF using existing seal generation pipeline
  // Import dynamically to avoid circular dependencies
  const { generateSealSvg } = await import('./sealGeneratorService');
  const { composeSealSheet } = await import('./sealSheetService');
  const { renderSvgToPng, createPdfFromPngs } = await import('./sheetPdfService');
  const { DEFAULT_SHEET_DECORATIONS } = await import('@/lib/constants/sheet');
  const { getLiveSealConfig } = await import('./sealPresetService');

  // Get live seal config (the admin-configured design)
  const sealConfig = await getLiveSealConfig();

  // Generate SVG for each seal using the live config
  const sealSvgs: string[] = [];
  for (const { token } of tokensToPrint) {
    const svg = await generateSealSvg(token, sheet.sealVersion, sealConfig);
    sealSvgs.push(svg);
  }

  // Compose sheets with registration marks
  const decorations = {
    ...DEFAULT_SHEET_DECORATIONS,
    showRegistrationMarks: config.includeRegistrationMarks ?? true,
    showCenterCrosshair: false,
    showFooter: true,
    productName: sheet.partner?.name ?? 'TripDAR Seals',
    versionLabel: sheet.sealVersion,
  };

  // Build sheet config for composition
  // The sealSheetService now accepts any numeric seal diameter
  const sheetConfig: SealSheetConfig = {
    paperSize: config.paperType.toLowerCase() as 'letter' | 'a4' | 'custom',
    customWidth: config.customWidthIn,
    customHeight: config.customHeightIn,
    sealDiameter: config.sealDiameterIn,
    marginIn: config.marginIn ?? DEFAULT_MARGIN_IN,
    decorations,
  };

  const sheetSvgs = composeSealSheet(sealSvgs, sheetConfig);

  // Convert to PDF
  const pngBuffers: Buffer[] = [];
  for (const sheetSvg of sheetSvgs) {
    const pngBuffer = renderSvgToPng(sheetSvg);
    pngBuffers.push(pngBuffer);
  }

  const pdfBuffer = await createPdfFromPngs(pngBuffers);

  // Create PrintJob record
  const printJob = await prisma.printJob.create({
    data: {
      status: 'CREATED',
      sheets: pageCount,
      entityType: 'CUSTOM',
      entityId: config.sealSheetId,
      versionId: sheet.sealVersion,
      quantity: sealCount,
      createdById: userId,
    },
  });

  // Mark tokens as printed
  const now = new Date();
  await prisma.qRToken.updateMany({
    where: {
      id: { in: tokenIds },
    },
    data: {
      metadata: {
        printedAt: now.toISOString(),
        printJobId: printJob.id,
        printConfig: {
          sealDiameterIn: config.sealDiameterIn,
          spacingIn: config.spacingIn,
          paperType: config.paperType,
        },
      },
    },
  });

  // Update PrintJob status
  await prisma.printJob.update({
    where: { id: printJob.id },
    data: { status: 'GENERATED' },
  });

  // Log the print job
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: printJob.id,
    action: 'seal_print_job_created',
    userId,
    summary: `Print job created: ${sealCount} seals on ${pageCount} pages`,
    metadata: {
      printJobId: printJob.id,
      sealSheetId: config.sealSheetId,
      partnerId: sheet.partnerId,
      partnerName: sheet.partner?.name,
      sealCount,
      pageCount,
      config: {
        sealDiameterIn: config.sealDiameterIn,
        spacingIn: config.spacingIn,
        paperType: config.paperType,
        marginIn: config.marginIn ?? DEFAULT_MARGIN_IN,
      },
      layout: {
        columns: layout.columns,
        rows: layout.rows,
        sealsPerSheet: layout.sealsPerSheet,
      },
      tokenIds,
      logCategory: 'certification',
    },
    tags: ['seal', 'tripdar', 'print_job', 'production', 'certification'],
  });

  return {
    jobId: printJob.id,
    layout,
    pageCount,
    sealCount,
    tokenIds,
    pdfBuffer,
  };
}

/**
 * Confirm a print job was successfully printed.
 * 
 * Call this after the operator confirms physical printing succeeded.
 */
export async function confirmPrintJob(
  jobId: string,
  userId: string
): Promise<void> {
  const job = await prisma.printJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Print job not found');
  }

  if (job.status === 'CONFIRMED') {
    return; // Already confirmed
  }

  await prisma.printJob.update({
    where: { id: jobId },
    data: { status: 'CONFIRMED' },
  });

  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: jobId,
    action: 'seal_print_job_confirmed',
    userId,
    summary: `Print job confirmed: ${job.quantity} seals printed successfully`,
    metadata: {
      printJobId: jobId,
      quantity: job.quantity,
      sheets: job.sheets,
      logCategory: 'certification',
    },
    tags: ['seal', 'tripdar', 'print_job', 'confirmed', 'certification'],
  });
}

/**
 * Cancel a print job (e.g., printer jam, wrong settings).
 * 
 * This releases the tokens back to unprinted state.
 */
export async function cancelPrintJob(
  jobId: string,
  reason: string,
  userId: string
): Promise<void> {
  const job = await prisma.printJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Print job not found');
  }

  if (job.status === 'CANCELLED') {
    return; // Already cancelled
  }

  if (job.status === 'CONFIRMED') {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Cannot cancel a confirmed print job'
    );
  }

  // Find tokens from this job and clear their print metadata
  // Note: We find tokens by printJobId in metadata
  const tokens = await prisma.qRToken.findMany({
    where: {
      sealSheetId: job.entityId,
    },
  });

  const tokenIdsToReset = tokens
    .filter((t) => {
      const metadata = t.metadata as Record<string, unknown> | null;
      return metadata?.printJobId === jobId;
    })
    .map((t) => t.id);

  // Clear print metadata from tokens
  if (tokenIdsToReset.length > 0) {
    await prisma.qRToken.updateMany({
      where: {
        id: { in: tokenIdsToReset },
      },
      data: {
        metadata: {
          printedAt: null,
          printJobId: null,
          printConfig: null,
          cancelledAt: new Date().toISOString(),
          cancelReason: reason,
        },
      },
    });
  }

  await prisma.printJob.update({
    where: { id: jobId },
    data: { status: 'CANCELLED' },
  });

  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: jobId,
    action: 'seal_print_job_cancelled',
    userId,
    summary: `Print job cancelled: ${reason}`,
    metadata: {
      printJobId: jobId,
      reason,
      tokensReleased: tokenIdsToReset.length,
      logCategory: 'certification',
    },
    tags: ['seal', 'tripdar', 'print_job', 'cancelled', 'certification'],
  });
}


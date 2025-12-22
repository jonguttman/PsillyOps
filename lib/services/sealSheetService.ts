/**
 * Seal Sheet Layout Service
 * 
 * Handles layout and composition of seals onto print sheets.
 * Supports Letter, A4, and custom paper sizes.
 * 
 * Phase 2B: Adds seal sheet assignment and management functions.
 */

import {
  SheetDecorations,
  DEFAULT_SHEET_DECORATIONS,
  REGISTRATION_MARK_LENGTH_IN,
  REGISTRATION_MARK_STROKE_WIDTH_IN,
  REGISTRATION_MARK_COLOR,
  FOOTER_FONT_SIZE_IN,
  FOOTER_COLOR,
  FOOTER_FONT_FAMILY,
} from '@/lib/constants/sheet';
import { SealDiameterPreset } from '@/lib/constants/seal';
import {
  composeLetterSheetsFromLabelSvgs,
  type LetterSheetLayoutMeta,
} from './labelService';
import { prisma } from '@/lib/db/prisma';
import { SealSheetStatus } from '@prisma/client';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { ActivityEntity } from '@prisma/client';

export type PaperSize = 'letter' | 'a4' | 'custom';

export interface SealSheetConfig {
  paperSize: PaperSize;
  customWidth?: number;  // inches (required if paperSize === 'custom')
  customHeight?: number; // inches (required if paperSize === 'custom')
  sealDiameter: SealDiameterPreset;
  marginIn: number;
  decorations: SheetDecorations;
}

export interface SealLayoutResult {
  columns: number;
  rows: number;
  perSheet: number;
}

// Paper size definitions (inches)
export const PAPER_SIZES = {
  letter: { width: 8.5, height: 11 },
  a4: { width: 8.27, height: 11.69 },
} as const;

/**
 * Get paper dimensions for a given size
 */
function getPaperDimensions(config: SealSheetConfig): { width: number; height: number } {
  if (config.paperSize === 'custom') {
    if (!config.customWidth || !config.customHeight) {
      throw new Error('customWidth and customHeight required for custom paper size');
    }
    return { width: config.customWidth, height: config.customHeight };
  }
  return PAPER_SIZES[config.paperSize];
}

/**
 * Calculate seal layout for a given sheet configuration
 */
export function calculateSealLayout(config: SealSheetConfig): SealLayoutResult {
  const { sealDiameter, marginIn } = config;
  const paper = getPaperDimensions(config);
  
  // Calculate usable area
  const usableWidth = paper.width - (marginIn * 2);
  const usableHeight = paper.height - (marginIn * 2);
  
  // Calculate how many seals fit (seals are circular, so treat as square with side = diameter)
  const columns = Math.floor(usableWidth / sealDiameter);
  const rows = Math.floor(usableHeight / sealDiameter);
  const perSheet = Math.max(0, columns * rows);
  
  return {
    columns: Math.max(1, columns),
    rows: Math.max(1, rows),
    perSheet: Math.max(1, perSheet),
  };
}

/**
 * Compose seal SVGs onto sheets
 * 
 * Reuses existing letter sheet composition logic for consistency.
 * 
 * NOTE: Currently delegates to letter sheet composition for all paper sizes.
 * The layout calculation (calculateSealLayout) correctly handles all sizes,
 * but the sheet SVG composition is letter-only for Phase 2A.
 * Phase 2B can extend to support A4 and custom sizes in sheet composition.
 */
export function composeSealSheet(
  sealSvgs: string[],
  config: SealSheetConfig
): string[] {
  const { sealDiameter, marginIn, decorations } = config;
  
  // Delegate to letter sheet composition
  // Layout calculation already accounts for paper size differences
  const result = composeLetterSheetsFromLabelSvgs({
    labelSvgs: sealSvgs,
    orientation: 'portrait',
    marginIn,
    decorations,
    uniqueLabels: true, // Each seal has unique QR token
    labelWidthInOverride: sealDiameter,
    labelHeightInOverride: sealDiameter,
  });
  
  return result.sheets;
}

// ========================================
// Phase 2B: Seal Sheet Assignment
// ========================================

/**
 * Assign a seal sheet to a partner
 * 
 * A sheet can only be assigned once. Assignment is permanent.
 * 
 * PHASE 2B SCOPE:
 * - One-time assignment (no reassignment)
 * - ADMIN-only operation
 * - Full audit logging
 * 
 * Phase 2B does NOT implement:
 * - Partner self-claiming (claim codes)
 * - Batch assignment operations
 * - Assignment windows or time limits
 */
export async function assignSheetToPartner(
  sheetId: string,
  partnerId: string,
  assignedById: string
) {
  // Verify sheet exists
  const sheet = await prisma.sealSheet.findUnique({
    where: { id: sheetId },
    include: {
      partner: true,
    },
  });

  if (!sheet) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Seal sheet not found');
  }

  // Verify sheet is not already assigned
  if (sheet.status === SealSheetStatus.ASSIGNED) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Seal sheet is already assigned to a partner'
    );
  }

  if (sheet.status === SealSheetStatus.REVOKED) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Cannot assign a revoked seal sheet'
    );
  }

  // Verify partner exists
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Partner not found');
  }

  // Assign sheet
  const updated = await prisma.sealSheet.update({
    where: { id: sheetId },
    data: {
      status: SealSheetStatus.ASSIGNED,
      partnerId,
      assignedById,
      assignedAt: new Date(),
    },
  });

  // Log assignment
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: sheetId,
    action: 'seal_sheet_assigned',
    userId: assignedById,
    summary: `Seal sheet assigned to partner ${partner.name}`,
    metadata: {
      sheetId,
      partnerId,
      partnerName: partner.name,
      tokenCount: sheet.tokenCount,
      tokensHash: sheet.tokensHash,
      sealVersion: sheet.sealVersion,
      logCategory: 'certification',
    },
    tags: ['seal', 'tripdar', 'sheet_assignment', 'certification'],
  });

  return updated;
}

/**
 * Revoke a seal sheet
 * 
 * Revoking a sheet disables all unassigned seals in it.
 */
export async function revokeSheet(
  sheetId: string,
  reason: string,
  revokedById: string
) {
  // Verify sheet exists
  const sheet = await prisma.sealSheet.findUnique({
    where: { id: sheetId },
    include: {
      partner: true,
    },
  });

  if (!sheet) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Seal sheet not found');
  }

  if (sheet.status === SealSheetStatus.REVOKED) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Seal sheet is already revoked'
    );
  }

  // Revoke sheet
  const updated = await prisma.sealSheet.update({
    where: { id: sheetId },
    data: {
      status: SealSheetStatus.REVOKED,
    },
  });

  // Log revocation
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: sheetId,
    action: 'seal_sheet_revoked',
    userId: revokedById,
    summary: `Seal sheet revoked: ${reason}`,
    metadata: {
      sheetId,
      partnerId: sheet.partnerId,
      partnerName: sheet.partner?.name,
      reason,
      tokenCount: sheet.tokenCount,
      tokensHash: sheet.tokensHash,
      sealVersion: sheet.sealVersion,
      logCategory: 'certification',
    },
    tags: ['seal', 'tripdar', 'sheet_revocation', 'certification'],
  });

  return updated;
}

/**
 * Get all sheets assigned to a partner
 */
export async function getSheetsByPartner(partnerId: string) {
  return await prisma.sealSheet.findMany({
    where: {
      partnerId,
      status: {
        in: [SealSheetStatus.ASSIGNED, SealSheetStatus.REVOKED],
      },
    },
    orderBy: {
      assignedAt: 'desc',
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Get all unassigned sheets
 */
export async function getUnassignedSheets() {
  return await prisma.sealSheet.findMany({
    where: {
      status: SealSheetStatus.UNASSIGNED,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Get sheet by ID with full details
 */
export async function getSheetById(sheetId: string) {
  const sheet = await prisma.sealSheet.findUnique({
    where: { id: sheetId },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      partner: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      tokens: {
        take: 100, // Limit for performance
        orderBy: {
          printedAt: 'desc',
        },
        select: {
          id: true,
          token: true,
          status: true,
          printedAt: true,
        },
      },
      _count: {
        select: {
          tokens: true,
        },
      },
    },
  });

  if (!sheet) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Seal sheet not found');
  }

  return sheet;
}


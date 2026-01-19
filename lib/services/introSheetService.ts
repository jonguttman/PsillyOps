/**
 * Intro Sheet Service
 *
 * Handles generation, tracking, and queries for retailer intro sheet PDFs.
 */

import { prisma } from '@/lib/db/prisma';
import { logAction } from './loggingService';
import { ActivityEntity } from '@prisma/client';
import { generateIntroSheetPdf } from './introSheetPdfService';

// ========================================
// TYPES
// ========================================

export interface GenerateIntroSheetParams {
  catalogLinkId: string;
  createdById: string;
}

export interface IntroSheetResult {
  id: string;
  pdfBuffer: Buffer;
  retailerName: string;
  token: string;
}

export interface IntroSheetData {
  id: string;
  retailerId: string;
  retailerName: string;
  catalogLinkId: string;
  token: string;
  displayName: string;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  firstScannedAt: Date | null;
  scanCount: number;
}

// ========================================
// GENERATE INTRO SHEET
// ========================================

export async function generateIntroSheet(
  params: GenerateIntroSheetParams
): Promise<IntroSheetResult> {
  const { catalogLinkId, createdById } = params;

  // Get catalog link with retailer info
  const catalogLink = await prisma.catalogLink.findUnique({
    where: { id: catalogLinkId },
    include: {
      retailer: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!catalogLink) {
    throw new Error('Catalog link not found');
  }

  if (catalogLink.status !== 'ACTIVE') {
    throw new Error('Catalog link is not active');
  }

  // Create the intro sheet record
  const introSheet = await prisma.retailerIntroSheet.create({
    data: {
      retailerId: catalogLink.retailerId,
      catalogLinkId: catalogLink.id,
      createdById
    }
  });

  // Build catalog URL (assumes production domain)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ops.originalpsilly.com';
  const catalogUrl = `${baseUrl}/catalog/${catalogLink.token}`;

  // Generate the PDF
  const pdfBuffer = await generateIntroSheetPdf({
    retailerName: catalogLink.retailer.name,
    displayName: catalogLink.displayName || undefined,
    catalogUrl,
    token: catalogLink.token
  });

  // Log the activity
  await logAction({
    entityType: ActivityEntity.INTRO_SHEET,
    entityId: introSheet.id,
    action: 'intro_sheet_generated',
    userId: createdById,
    summary: `Generated intro sheet for ${catalogLink.displayName || catalogLink.retailer.name}`,
    metadata: {
      introSheetId: introSheet.id,
      catalogLinkId: catalogLink.id,
      retailerId: catalogLink.retailerId,
      retailerName: catalogLink.retailer.name,
      displayName: catalogLink.displayName,
      token: catalogLink.token
    },
    tags: ['intro_sheet', 'generated']
  });

  return {
    id: introSheet.id,
    pdfBuffer,
    retailerName: catalogLink.displayName || catalogLink.retailer.name,
    token: catalogLink.token
  };
}

// ========================================
// TRACK INTRO SHEET SCAN
// ========================================

export async function trackIntroSheetScan(
  catalogLinkId: string,
  metadata?: { ip?: string; userAgent?: string }
): Promise<void> {
  // Find intro sheets associated with this catalog link
  const introSheets = await prisma.retailerIntroSheet.findMany({
    where: { catalogLinkId },
    orderBy: { createdAt: 'desc' },
    take: 1 // Get the most recent one
  });

  if (introSheets.length === 0) {
    // No intro sheet for this catalog link - nothing to track
    return;
  }

  const introSheet = introSheets[0];

  // Update the intro sheet with scan tracking
  await prisma.retailerIntroSheet.update({
    where: { id: introSheet.id },
    data: {
      firstScannedAt: introSheet.firstScannedAt || new Date(),
      scanCount: { increment: 1 }
    }
  });

  // Log only the first scan as a notable event
  if (!introSheet.firstScannedAt) {
    await logAction({
      entityType: ActivityEntity.INTRO_SHEET,
      entityId: introSheet.id,
      action: 'intro_sheet_first_scan',
      ipAddress: metadata?.ip,
      userAgent: metadata?.userAgent,
      summary: `First scan of intro sheet from catalog link`,
      metadata: {
        introSheetId: introSheet.id,
        catalogLinkId,
        scanCount: 1
      },
      tags: ['intro_sheet', 'scan', 'first_scan', 'conversion']
    });
  }
}

// ========================================
// QUERIES
// ========================================

export async function getIntroSheet(id: string): Promise<IntroSheetData | null> {
  const sheet = await prisma.retailerIntroSheet.findUnique({
    where: { id },
    include: {
      retailer: { select: { id: true, name: true } },
      catalogLink: { select: { id: true, token: true, displayName: true } },
      createdBy: { select: { id: true, name: true } }
    }
  });

  if (!sheet) {
    return null;
  }

  return {
    id: sheet.id,
    retailerId: sheet.retailerId,
    retailerName: sheet.retailer.name,
    catalogLinkId: sheet.catalogLinkId,
    token: sheet.catalogLink.token,
    displayName: sheet.catalogLink.displayName || sheet.retailer.name,
    createdById: sheet.createdById,
    createdByName: sheet.createdBy.name,
    createdAt: sheet.createdAt,
    firstScannedAt: sheet.firstScannedAt,
    scanCount: sheet.scanCount
  };
}

export async function listIntroSheets(options?: {
  retailerId?: string;
  catalogLinkId?: string;
  createdById?: string;
  limit?: number;
  offset?: number;
}): Promise<{ sheets: IntroSheetData[]; total: number }> {
  const where: any = {};

  if (options?.retailerId) {
    where.retailerId = options.retailerId;
  }
  if (options?.catalogLinkId) {
    where.catalogLinkId = options.catalogLinkId;
  }
  if (options?.createdById) {
    where.createdById = options.createdById;
  }

  const [sheets, total] = await Promise.all([
    prisma.retailerIntroSheet.findMany({
      where,
      include: {
        retailer: { select: { id: true, name: true } },
        catalogLink: { select: { id: true, token: true, displayName: true } },
        createdBy: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0
    }),
    prisma.retailerIntroSheet.count({ where })
  ]);

  return {
    sheets: sheets.map(sheet => ({
      id: sheet.id,
      retailerId: sheet.retailerId,
      retailerName: sheet.retailer.name,
      catalogLinkId: sheet.catalogLinkId,
      token: sheet.catalogLink.token,
      displayName: sheet.catalogLink.displayName || sheet.retailer.name,
      createdById: sheet.createdById,
      createdByName: sheet.createdBy.name,
      createdAt: sheet.createdAt,
      firstScannedAt: sheet.firstScannedAt,
      scanCount: sheet.scanCount
    })),
    total
  };
}

/**
 * Intro Sheet Service
 *
 * Handles generation, tracking, and queries for retailer intro sheet PDFs.
 */

import { prisma } from '@/lib/db/prisma';
import { logAction } from './loggingService';
import { ActivityEntity } from '@prisma/client';
import { generateIntroSheetPdf, generateHalfPagePdf } from './introSheetPdfService';

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

  // Get catalog link with retailer and sales rep info
  const catalogLink = await prisma.catalogLink.findUnique({
    where: { id: catalogLinkId },
    include: {
      retailer: {
        select: {
          id: true,
          name: true,
          salesRep: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
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

  // Generate the PDF with sales rep info
  const pdfBuffer = await generateIntroSheetPdf({
    retailerName: catalogLink.retailer.name,
    displayName: catalogLink.displayName || undefined,
    catalogUrl,
    token: catalogLink.token,
    salesRepName: catalogLink.retailer.salesRep?.name || undefined,
    salesRepEmail: catalogLink.retailer.salesRep?.email || undefined
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
// GENERATE HALF-PAGE LEAVE-BEHIND
// ========================================

export async function generateHalfPageIntroSheet(
  params: GenerateIntroSheetParams
): Promise<IntroSheetResult> {
  const { catalogLinkId, createdById } = params;

  // Get catalog link with retailer and sales rep info
  const catalogLink = await prisma.catalogLink.findUnique({
    where: { id: catalogLinkId },
    include: {
      retailer: {
        select: {
          id: true,
          name: true,
          salesRep: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
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

  // Create the intro sheet record (same tracking for half-page)
  const introSheet = await prisma.retailerIntroSheet.create({
    data: {
      retailerId: catalogLink.retailerId,
      catalogLinkId: catalogLink.id,
      createdById
    }
  });

  // Build catalog URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ops.originalpsilly.com';
  const catalogUrl = `${baseUrl}/catalog/${catalogLink.token}`;

  // Generate the half-page PDF
  const pdfBuffer = await generateHalfPagePdf({
    retailerName: catalogLink.retailer.name,
    displayName: catalogLink.displayName || undefined,
    catalogUrl,
    token: catalogLink.token,
    salesRepName: catalogLink.retailer.salesRep?.name || undefined,
    salesRepEmail: catalogLink.retailer.salesRep?.email || undefined
  });

  // Log the activity
  await logAction({
    entityType: ActivityEntity.INTRO_SHEET,
    entityId: introSheet.id,
    action: 'intro_sheet_generated',
    userId: createdById,
    summary: `Generated half-page intro sheet for ${catalogLink.displayName || catalogLink.retailer.name}`,
    metadata: {
      introSheetId: introSheet.id,
      catalogLinkId: catalogLink.id,
      retailerId: catalogLink.retailerId,
      retailerName: catalogLink.retailer.name,
      displayName: catalogLink.displayName,
      token: catalogLink.token,
      format: 'half_page'
    },
    tags: ['intro_sheet', 'generated', 'half_page']
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
  // Find intro sheets associated with this catalog link with retailer/sales rep info
  const introSheets = await prisma.retailerIntroSheet.findMany({
    where: { catalogLinkId },
    orderBy: { createdAt: 'desc' },
    take: 1, // Get the most recent one
    include: {
      retailer: {
        select: {
          name: true,
          salesRep: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      },
      catalogLink: {
        select: {
          displayName: true,
          token: true
        }
      }
    }
  });

  if (introSheets.length === 0) {
    // No intro sheet for this catalog link - nothing to track
    return;
  }

  const introSheet = introSheets[0];
  const isFirstScan = !introSheet.firstScannedAt;

  // Update the intro sheet with scan tracking
  await prisma.retailerIntroSheet.update({
    where: { id: introSheet.id },
    data: {
      firstScannedAt: introSheet.firstScannedAt || new Date(),
      scanCount: { increment: 1 }
    }
  });

  // On first scan: log event and notify sales rep
  if (isFirstScan) {
    const displayName = introSheet.catalogLink.displayName || introSheet.retailer.name;

    await logAction({
      entityType: ActivityEntity.INTRO_SHEET,
      entityId: introSheet.id,
      action: 'intro_sheet_first_scan',
      ipAddress: metadata?.ip,
      userAgent: metadata?.userAgent,
      summary: `First scan of intro sheet for ${displayName}`,
      metadata: {
        introSheetId: introSheet.id,
        catalogLinkId,
        retailerName: introSheet.retailer.name,
        displayName,
        scanCount: 1
      },
      tags: ['intro_sheet', 'scan', 'first_scan', 'conversion']
    });

    // Notify sales rep via email (non-blocking)
    if (introSheet.retailer.salesRep?.email) {
      notifySalesRepOfScan({
        salesRepEmail: introSheet.retailer.salesRep.email,
        salesRepName: introSheet.retailer.salesRep.name,
        retailerName: displayName,
        catalogToken: introSheet.catalogLink.token
      }).catch(err => {
        console.error('[introSheetService] Failed to notify sales rep:', err);
      });
    }
  }
}

// ========================================
// NOTIFY SALES REP OF FIRST SCAN
// ========================================

interface NotifySalesRepParams {
  salesRepEmail: string;
  salesRepName: string;
  retailerName: string;
  catalogToken: string;
}

async function notifySalesRepOfScan(params: NotifySalesRepParams): Promise<void> {
  const { salesRepEmail, salesRepName, retailerName, catalogToken } = params;

  // Only send notification if Resend is configured
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[introSheetService] RESEND_API_KEY not configured, skipping notification');
    return;
  }

  // Dynamic import to avoid issues if Resend isn't installed
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ops.originalpsilly.com';
  const catalogUrl = `${baseUrl}/catalog/${catalogToken}`;

  const subject = `Intro sheet scanned - ${retailerName}`;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1a1a1a; margin: 0 0 16px 0;">Intro Sheet Scanned</h2>

      <p style="color: #4b5563; margin: 0 0 16px 0;">
        Hi ${salesRepName},
      </p>

      <p style="color: #4b5563; margin: 0 0 16px 0;">
        Your intro sheet for <strong>${retailerName}</strong> was just scanned for the first time.
        This is a good time to follow up!
      </p>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${catalogUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
          View Their Catalog
        </a>
      </div>

      <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0 0; text-align: center;">
        This is an automated notification from PsillyOps.
      </p>
    </div>
  `;

  const textContent = `
Intro Sheet Scanned

Hi ${salesRepName},

Your intro sheet for ${retailerName} was just scanned for the first time.
This is a good time to follow up!

View their catalog: ${catalogUrl}

---
This is an automated notification from PsillyOps.
  `.trim();

  try {
    await resend.emails.send({
      from: 'PsillyOps Notifications <notifications@originalpsilly.com>',
      to: salesRepEmail,
      subject,
      html: htmlContent,
      text: textContent
    });
    console.log(`[introSheetService] Notified ${salesRepEmail} about scan for ${retailerName}`);
  } catch (error) {
    console.error('[introSheetService] Failed to send notification email:', error);
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

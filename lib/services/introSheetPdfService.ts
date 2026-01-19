/**
 * Intro Sheet PDF Service
 *
 * Generates print-ready, personalized retailer intro one-pager PDFs
 * with a QR code linking to their catalog.
 *
 * Page: US Letter (8.5" × 11"), Portrait
 * Margins: 0.75" all sides
 * QR Size: 3.5" × 3.5" (252 points), centered with subtle border
 */

import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import QRCode from 'qrcode';

// Page dimensions in points (72 points = 1 inch)
const PAGE_WIDTH = 612;   // 8.5"
const PAGE_HEIGHT = 792;  // 11"
const MARGIN = 54;        // 0.75"

// QR code size (reduced from 4" to 3.5" for better balance)
const QR_SIZE_INCHES = 3.5;
const QR_SIZE_POINTS = QR_SIZE_INCHES * 72; // 252 points

// Content area
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

// Two-column layout
const COLUMN_GAP = 24;
const COLUMN_WIDTH = (CONTENT_WIDTH - COLUMN_GAP) / 2;

// Colors
const COLORS = {
  heading: '#1a1a1a',
  subheading: '#333333',
  body: '#444444',
  muted: '#555555',
  footer: '#888888',
  divider: '#e0e0e0',
  qrBorder: '#cccccc'
};

// ========================================
// TYPES
// ========================================

export interface IntroSheetPdfParams {
  retailerName: string;
  displayName?: string;
  catalogUrl: string;   // Base URL without ref param
  token: string;
  salesRepName?: string;
  salesRepEmail?: string;
}

export interface HalfPagePdfParams extends IntroSheetPdfParams {
  // Same params, different layout
}

// ========================================
// FULL PAGE PDF GENERATION
// ========================================

export async function generateIntroSheetPdf(
  params: IntroSheetPdfParams
): Promise<Buffer> {
  const { retailerName, displayName, catalogUrl, token, salesRepName, salesRepEmail } = params;

  console.log('[introSheetPdf] Starting generation:', {
    retailerName,
    displayName,
    catalogUrl,
    token,
    salesRepName
  });

  // Use displayName if provided, otherwise retailerName
  const name = displayName || retailerName;

  // Build QR URL with tracking ref param
  const qrUrl = `${catalogUrl}?ref=intro_sheet`;

  // Generate QR code as SVG
  console.log('[introSheetPdf] Generating QR code for URL:', qrUrl);
  let qrSvg: string;
  try {
    qrSvg = await QRCode.toString(qrUrl, {
      type: 'svg',
      margin: 0,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    console.log('[introSheetPdf] QR code generated, SVG length:', qrSvg.length);
  } catch (qrError) {
    console.error('[introSheetPdf] QR code generation failed:', qrError);
    throw qrError;
  }

  // Create PDF document
  console.log('[introSheetPdf] Creating PDF document...');
  const doc = new PDFDocument({
    size: [PAGE_WIDTH, PAGE_HEIGHT],
    margin: MARGIN,
    info: {
      Title: `Introduction - ${name}`,
      Author: 'PsillyOps',
      Subject: 'Retailer Introduction Sheet',
      Creator: 'PsillyOps Intro Sheet Generator'
    }
  });

  // Collect PDF chunks
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.on('error', (err) => {
    console.error('[introSheetPdf] PDFDocument stream error:', err);
  });

  const pdfComplete = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => {
      console.log('[introSheetPdf] PDF stream ended, total chunks:', chunks.length);
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });

  let currentY = MARGIN;

  // ========================================
  // 1. PERSONALIZATION HEADER
  // ========================================
  doc.fontSize(20)
    .font('Helvetica-Bold')
    .fillColor(COLORS.heading)
    .text(`For the team at ${name}`, MARGIN, currentY, {
      width: CONTENT_WIDTH,
      align: 'center'
    });

  currentY += 45;

  // ========================================
  // 2. SUBTLE DIVIDER
  // ========================================
  doc.moveTo(MARGIN + 100, currentY)
    .lineTo(PAGE_WIDTH - MARGIN - 100, currentY)
    .strokeColor(COLORS.divider)
    .lineWidth(0.5)
    .stroke();

  currentY += 30;

  // ========================================
  // 3. MAIN HEADLINE (Warmer tone)
  // ========================================
  doc.fontSize(22)
    .font('Helvetica-Bold')
    .fillColor(COLORS.heading)
    .text('Thoughtfully crafted ritual mushroom', MARGIN, currentY, {
      width: CONTENT_WIDTH,
      align: 'center'
    });

  currentY += 28;

  doc.text('products for intentional experiences', MARGIN, currentY, {
    width: CONTENT_WIDTH,
    align: 'center'
  });

  currentY += 40;

  // ========================================
  // 4. TWO-COLUMN SECTION
  // ========================================
  const columnStartY = currentY;
  const leftColumnX = MARGIN;
  const rightColumnX = MARGIN + COLUMN_WIDTH + COLUMN_GAP;

  // Left Column: What We Make
  doc.fontSize(11)
    .font('Helvetica-Bold')
    .fillColor(COLORS.subheading)
    .text('WHAT WE MAKE', leftColumnX, columnStartY, {
      width: COLUMN_WIDTH
    });

  currentY = columnStartY + 20;

  const leftBullets = [
    'Strain-specific formulations',
    'Microdose to full journey options',
    'Lab-tested, consistent dosing'
  ];

  doc.fontSize(10)
    .font('Helvetica')
    .fillColor(COLORS.body);

  leftBullets.forEach((bullet, index) => {
    doc.text(`•  ${bullet}`, leftColumnX, currentY + (index * 18), {
      width: COLUMN_WIDTH
    });
  });

  // Right Column: How to Sell It
  doc.fontSize(11)
    .font('Helvetica-Bold')
    .fillColor(COLORS.subheading)
    .text('HOW TO SELL IT', rightColumnX, columnStartY, {
      width: COLUMN_WIDTH
    });

  const rightBullets = [
    'Display near wellness products',
    'Staff training resources included',
    'Customer education materials available'
  ];

  doc.fontSize(10)
    .font('Helvetica')
    .fillColor(COLORS.body);

  rightBullets.forEach((bullet, index) => {
    doc.text(`•  ${bullet}`, rightColumnX, columnStartY + 20 + (index * 18), {
      width: COLUMN_WIDTH
    });
  });

  currentY = columnStartY + 20 + (leftBullets.length * 18) + 30;

  // ========================================
  // 5. QR CODE (3.5" with subtle border)
  // ========================================
  const qrX = (PAGE_WIDTH - QR_SIZE_POINTS) / 2;
  const qrBorderPadding = 8;

  // Draw subtle border around QR
  doc.rect(
    qrX - qrBorderPadding,
    currentY - qrBorderPadding,
    QR_SIZE_POINTS + (qrBorderPadding * 2),
    QR_SIZE_POINTS + (qrBorderPadding * 2)
  )
    .strokeColor(COLORS.qrBorder)
    .lineWidth(0.5)
    .stroke();

  console.log('[introSheetPdf] Embedding QR code at position:', { qrX, currentY, QR_SIZE_POINTS });
  try {
    SVGtoPDF(doc, qrSvg, qrX, currentY, {
      width: QR_SIZE_POINTS,
      height: QR_SIZE_POINTS,
      preserveAspectRatio: 'xMidYMid meet'
    });
    console.log('[introSheetPdf] QR SVG embedded successfully');
  } catch (svgError) {
    console.error('[introSheetPdf] SVGtoPDF error:', svgError);
    // Fallback: draw a placeholder rectangle
    console.log('[introSheetPdf] Using fallback placeholder...');
    doc.rect(qrX, currentY, QR_SIZE_POINTS, QR_SIZE_POINTS)
      .strokeColor('#ccc')
      .lineWidth(2)
      .stroke();
    doc.fontSize(14)
      .fillColor('#999')
      .text('QR Code', qrX, currentY + QR_SIZE_POINTS / 2 - 7, {
        width: QR_SIZE_POINTS,
        align: 'center'
      });
  }

  currentY += QR_SIZE_POINTS + 25;

  // ========================================
  // 6. QR HELPER TEXT
  // ========================================
  doc.fontSize(11)
    .font('Helvetica')
    .fillColor(COLORS.muted)
    .text('Scan to view products, pricing, and request samples', MARGIN, currentY, {
      width: CONTENT_WIDTH,
      align: 'center'
    });

  currentY += 35;

  // ========================================
  // 7. SUBTLE DIVIDER
  // ========================================
  doc.moveTo(MARGIN + 100, currentY)
    .lineTo(PAGE_WIDTH - MARGIN - 100, currentY)
    .strokeColor(COLORS.divider)
    .lineWidth(0.5)
    .stroke();

  currentY += 25;

  // ========================================
  // 8. FOOTER - Rep Contact or Generic
  // ========================================
  if (salesRepName && salesRepEmail) {
    doc.fontSize(10)
      .font('Helvetica')
      .fillColor(COLORS.footer)
      .text(`Questions? Contact ${salesRepName} at ${salesRepEmail}`, MARGIN, currentY, {
        width: CONTENT_WIDTH,
        align: 'center'
      });
  } else if (salesRepName) {
    doc.fontSize(10)
      .font('Helvetica')
      .fillColor(COLORS.footer)
      .text(`Questions? Reach out to ${salesRepName}`, MARGIN, currentY, {
        width: CONTENT_WIDTH,
        align: 'center'
      });
  } else {
    doc.fontSize(10)
      .font('Helvetica')
      .fillColor(COLORS.footer)
      .text('Questions? Reach out to your account representative', MARGIN, currentY, {
        width: CONTENT_WIDTH,
        align: 'center'
      });
  }

  // Finalize PDF
  console.log('[introSheetPdf] Finalizing PDF document...');
  doc.end();

  try {
    const result = await pdfComplete;
    console.log('[introSheetPdf] PDF generation complete, buffer size:', result.length);
    return result;
  } catch (finalError) {
    console.error('[introSheetPdf] PDF finalization failed:', finalError);
    throw finalError;
  }
}

// ========================================
// HALF-PAGE LEAVE-BEHIND VARIANT
// ========================================

export async function generateHalfPagePdf(
  params: HalfPagePdfParams
): Promise<Buffer> {
  const { retailerName, displayName, catalogUrl, token, salesRepName, salesRepEmail } = params;

  console.log('[introSheetPdf:halfPage] Starting generation:', {
    retailerName,
    displayName,
    catalogUrl,
    token
  });

  const name = displayName || retailerName;
  const qrUrl = `${catalogUrl}?ref=intro_sheet_half`;

  // Generate QR code as SVG
  let qrSvg: string;
  try {
    qrSvg = await QRCode.toString(qrUrl, {
      type: 'svg',
      margin: 0,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  } catch (qrError) {
    console.error('[introSheetPdf:halfPage] QR code generation failed:', qrError);
    throw qrError;
  }

  // Half-page dimensions (US Letter width, half height)
  const halfPageHeight = PAGE_HEIGHT / 2; // 396 points = 5.5"
  const halfMargin = 36; // 0.5" margins for compact layout
  const halfQrSize = 2.5 * 72; // 2.5" QR code (180 points)
  const halfContentWidth = PAGE_WIDTH - 2 * halfMargin;

  const doc = new PDFDocument({
    size: [PAGE_WIDTH, halfPageHeight],
    margin: halfMargin,
    info: {
      Title: `Introduction - ${name} (Leave-Behind)`,
      Author: 'PsillyOps',
      Subject: 'Retailer Introduction Card',
      Creator: 'PsillyOps Intro Sheet Generator'
    }
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.on('error', (err) => {
    console.error('[introSheetPdf:halfPage] PDFDocument stream error:', err);
  });

  const pdfComplete = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });

  let currentY = halfMargin;

  // ========================================
  // COMPACT HEADER
  // ========================================
  doc.fontSize(16)
    .font('Helvetica-Bold')
    .fillColor(COLORS.heading)
    .text(`For ${name}`, halfMargin, currentY, {
      width: halfContentWidth,
      align: 'center'
    });

  currentY += 28;

  // ========================================
  // COMPACT HEADLINE
  // ========================================
  doc.fontSize(14)
    .font('Helvetica-Bold')
    .fillColor(COLORS.heading)
    .text('Ritual mushroom products for intentional experiences', halfMargin, currentY, {
      width: halfContentWidth,
      align: 'center'
    });

  currentY += 30;

  // ========================================
  // QR CODE (2.5" centered)
  // ========================================
  const qrX = (PAGE_WIDTH - halfQrSize) / 2;
  const qrBorderPadding = 6;

  // Subtle border
  doc.rect(
    qrX - qrBorderPadding,
    currentY - qrBorderPadding,
    halfQrSize + (qrBorderPadding * 2),
    halfQrSize + (qrBorderPadding * 2)
  )
    .strokeColor(COLORS.qrBorder)
    .lineWidth(0.5)
    .stroke();

  try {
    SVGtoPDF(doc, qrSvg, qrX, currentY, {
      width: halfQrSize,
      height: halfQrSize,
      preserveAspectRatio: 'xMidYMid meet'
    });
  } catch (svgError) {
    console.error('[introSheetPdf:halfPage] SVGtoPDF error:', svgError);
    doc.rect(qrX, currentY, halfQrSize, halfQrSize)
      .strokeColor('#ccc')
      .lineWidth(1)
      .stroke();
  }

  currentY += halfQrSize + 18;

  // ========================================
  // HELPER TEXT
  // ========================================
  doc.fontSize(10)
    .font('Helvetica')
    .fillColor(COLORS.muted)
    .text('Scan to view products & request samples', halfMargin, currentY, {
      width: halfContentWidth,
      align: 'center'
    });

  currentY += 20;

  // ========================================
  // REP CONTACT (if available)
  // ========================================
  if (salesRepName) {
    const contactText = salesRepEmail
      ? `${salesRepName}  •  ${salesRepEmail}`
      : salesRepName;
    doc.fontSize(9)
      .font('Helvetica')
      .fillColor(COLORS.footer)
      .text(contactText, halfMargin, currentY, {
        width: halfContentWidth,
        align: 'center'
      });
  }

  doc.end();

  try {
    const result = await pdfComplete;
    console.log('[introSheetPdf:halfPage] PDF generation complete, buffer size:', result.length);
    return result;
  } catch (finalError) {
    console.error('[introSheetPdf:halfPage] PDF finalization failed:', finalError);
    throw finalError;
  }
}

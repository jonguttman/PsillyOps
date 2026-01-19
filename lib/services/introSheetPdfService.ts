/**
 * Intro Sheet PDF Service
 *
 * Generates print-ready, personalized retailer intro one-pager PDFs
 * with a large QR code linking to their catalog.
 *
 * Page: US Letter (8.5" × 11"), Portrait
 * Margins: 0.75" all sides
 * QR Size: 4.0" × 4.0" (288 points), centered
 */

import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import QRCode from 'qrcode';

// Page dimensions in points (72 points = 1 inch)
const PAGE_WIDTH = 612;   // 8.5"
const PAGE_HEIGHT = 792;  // 11"
const MARGIN = 54;        // 0.75"

// QR code size
const QR_SIZE_INCHES = 4.0;
const QR_SIZE_POINTS = QR_SIZE_INCHES * 72; // 288 points

// Content area
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

// ========================================
// TYPES
// ========================================

export interface IntroSheetPdfParams {
  retailerName: string;
  displayName?: string;
  catalogUrl: string;   // Base URL without ref param
  token: string;
}

// ========================================
// PDF GENERATION
// ========================================

export async function generateIntroSheetPdf(
  params: IntroSheetPdfParams
): Promise<Buffer> {
  const { retailerName, displayName, catalogUrl, token } = params;

  console.log('[introSheetPdf] Starting generation:', {
    retailerName,
    displayName,
    catalogUrl,
    token
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
  doc.fontSize(18)
    .font('Helvetica-Bold')
    .fillColor('#1a1a1a')
    .text(`For the team at ${name}`, MARGIN, currentY, {
      width: CONTENT_WIDTH,
      align: 'center'
    });

  currentY += 40;

  // ========================================
  // 2. DIVIDER LINE
  // ========================================
  doc.moveTo(MARGIN + 50, currentY)
    .lineTo(PAGE_WIDTH - MARGIN - 50, currentY)
    .strokeColor('#e5e5e5')
    .lineWidth(1)
    .stroke();

  currentY += 30;

  // ========================================
  // 3. CATEGORY HEADLINE
  // ========================================
  doc.fontSize(24)
    .font('Helvetica-Bold')
    .fillColor('#1a1a1a')
    .text('Strain-specific ritual mushroom', MARGIN, currentY, {
      width: CONTENT_WIDTH,
      align: 'center'
    });

  currentY += 32;

  doc.text('products', MARGIN, currentY, {
    width: CONTENT_WIDTH,
    align: 'center'
  });

  currentY += 40;

  // ========================================
  // 4. SUBHEADLINE
  // ========================================
  doc.fontSize(12)
    .font('Helvetica')
    .fillColor('#666666')
    .text('Designed for a range of intentional experiences —', MARGIN, currentY, {
      width: CONTENT_WIDTH,
      align: 'center'
    });

  currentY += 18;

  doc.text('from microdosing to deeper journeys', MARGIN, currentY, {
    width: CONTENT_WIDTH,
    align: 'center'
  });

  currentY += 50;

  // ========================================
  // 5. QR CODE (Vector SVG, 4" centered)
  // ========================================
  const qrX = (PAGE_WIDTH - QR_SIZE_POINTS) / 2;

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

  currentY += QR_SIZE_POINTS + 30;

  // ========================================
  // 6. HELPER TEXT
  // ========================================
  doc.fontSize(11)
    .font('Helvetica')
    .fillColor('#666666')
    .text('View products  ·  Request samples  ·  Get a quote', MARGIN, currentY, {
      width: CONTENT_WIDTH,
      align: 'center'
    });

  currentY += 40;

  // ========================================
  // 7. DIVIDER LINE
  // ========================================
  doc.moveTo(MARGIN + 50, currentY)
    .lineTo(PAGE_WIDTH - MARGIN - 50, currentY)
    .strokeColor('#e5e5e5')
    .lineWidth(1)
    .stroke();

  currentY += 25;

  // ========================================
  // 8. EDUCATION SECTION
  // ========================================
  doc.fontSize(11)
    .font('Helvetica')
    .fillColor('#666666')
    .text('Staff and customer education included', MARGIN, currentY, {
      width: CONTENT_WIDTH,
      align: 'center'
    });

  currentY += 18;

  doc.text('Guidance across microdosing, moderate use, and intentional experiences', MARGIN, currentY, {
    width: CONTENT_WIDTH,
    align: 'center'
  });

  currentY += 40;

  // ========================================
  // 9. DIVIDER LINE
  // ========================================
  doc.moveTo(MARGIN + 50, currentY)
    .lineTo(PAGE_WIDTH - MARGIN - 50, currentY)
    .strokeColor('#e5e5e5')
    .lineWidth(1)
    .stroke();

  currentY += 25;

  // ========================================
  // 10. TRUST FOOTER
  // ========================================
  doc.fontSize(10)
    .font('Helvetica')
    .fillColor('#999999')
    .text('Built for retail partners  ·  Educational resources included', MARGIN, currentY, {
      width: CONTENT_WIDTH,
      align: 'center'
    });

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

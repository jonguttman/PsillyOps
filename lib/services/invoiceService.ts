// INVOICE SERVICE - Invoice and manifest generation
// ALL business logic for invoicing and document generation

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction, generateSummary } from './loggingService';
import { ActivityEntity, OrderStatus } from '@prisma/client';
import { generateOrderNumber, formatCurrency, formatDate } from '@/lib/utils/formatters';
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, degrees } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';
import { COMPANY_CONFIG } from '@/lib/config/company';

// ========================================
// INVOICE NUMBER GENERATION
// ========================================

/**
 * Generate a unique invoice number
 * Format: INV-YYYYMMDD-XXXX
 */
export function generateInvoiceNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${dateStr}-${random}`;
}

// ========================================
// INVOICE GENERATION
// ========================================

export interface GenerateInvoiceParams {
  orderId: string;
  notes?: string;
  userId?: string;
}

/**
 * Generate an invoice for an order
 * Creates Invoice record with snapshotted pricing
 */
export async function generateInvoice(params: GenerateInvoiceParams): Promise<string> {
  const { orderId, notes, userId } = params;

  // Fetch the order with line items
  const order = await prisma.retailerOrder.findUnique({
    where: { id: orderId },
    include: {
      retailer: true,
      lineItems: {
        include: {
          product: true
        }
      },
      invoices: true
    }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found');
  }

  // Check if invoice already exists for this order
  if (order.invoices.length > 0) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Invoice already exists for this order'
    );
  }

  // Calculate subtotal from line items (using snapshotted prices if available)
  let subtotal = 0;
  for (const item of order.lineItems) {
    if (item.lineTotal !== null) {
      subtotal += item.lineTotal;
    } else if (item.unitWholesalePrice !== null) {
      subtotal += item.unitWholesalePrice * item.quantityOrdered;
    } else {
      // Fallback to current product price (should not happen if prices were snapshotted)
      const price = item.product.wholesalePrice ?? 0;
      subtotal += price * item.quantityOrdered;
    }
  }

  // Create the invoice
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNo: generateInvoiceNumber(),
      orderId,
      retailerId: order.retailerId,
      subtotal,
      notes
    }
  });

  // Log the action
  await logAction({
    entityType: ActivityEntity.INVOICE,
    entityId: invoice.id,
    action: 'created',
    userId,
    summary: generateSummary({
      userName: 'User',
      action: 'created',
      entityName: `invoice ${invoice.invoiceNo}`,
      metadata: {
        orderNumber: order.orderNumber,
        retailer: order.retailer.name
      }
    }),
    metadata: {
      invoiceNo: invoice.invoiceNo,
      orderNumber: order.orderNumber,
      retailerName: order.retailer.name,
      subtotal
    },
    tags: ['invoice', 'created']
  });

  return invoice.id;
}

// ========================================
// PDF GENERATION
// ========================================

interface InvoicePdfData {
  invoiceNo: string;
  issuedAt: Date;
  retailerName: string;
  retailerAddress: string | null;
  retailerEmail: string | null;
  orderNumber: string;
  lineItems: {
    productName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  notes: string | null;
}

/**
 * Generate PDF buffer for an invoice
 */
export async function generateInvoicePdf(invoiceId: string): Promise<Buffer> {
  // Fetch invoice with all related data
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      retailer: true,
      order: {
        include: {
          lineItems: {
            include: {
              product: true
            }
          }
        }
      }
    }
  });

  if (!invoice) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Invoice not found');
  }

  // Prepare invoice data
  const data: InvoicePdfData = {
    invoiceNo: invoice.invoiceNo,
    issuedAt: invoice.issuedAt,
    retailerName: invoice.retailer.name,
    retailerAddress: invoice.retailer.billingAddress,
    retailerEmail: invoice.retailer.contactEmail,
    orderNumber: invoice.order.orderNumber,
    lineItems: invoice.order.lineItems.map(item => ({
      productName: item.product.name,
      sku: item.product.sku,
      quantity: item.quantityOrdered,
      unitPrice: item.unitWholesalePrice ?? item.product.wholesalePrice ?? 0,
      lineTotal: item.lineTotal ?? (item.unitWholesalePrice ?? item.product.wholesalePrice ?? 0) * item.quantityOrdered
    })),
    subtotal: invoice.subtotal,
    notes: invoice.notes
  };

  return createInvoicePdfBuffer(data);
}

/**
 * Create the actual PDF buffer for an invoice
 */
async function createInvoicePdfBuffer(data: InvoicePdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { height } = page.getSize();
  
  // Embed fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Header
  page.drawText('INVOICE', {
    x: 250,
    y: height - 50,
    size: 24,
    font: helveticaBold,
  });
  
  // Invoice details (right aligned)
  let rightY = height - 80;
  page.drawText(`Invoice #: ${data.invoiceNo}`, { x: 400, y: rightY, size: 10, font: helvetica });
  rightY -= 14;
  page.drawText(`Date: ${formatDate(data.issuedAt)}`, { x: 400, y: rightY, size: 10, font: helvetica });
  rightY -= 14;
  page.drawText(`Order #: ${data.orderNumber}`, { x: 400, y: rightY, size: 10, font: helvetica });
  
  // Company header
  page.drawText('PsillyOps', { x: 50, y: height - 100, size: 14, font: helveticaBold });
  page.drawText('123 Business Street', { x: 50, y: height - 118, size: 10, font: helvetica });
  page.drawText('City, State 12345', { x: 50, y: height - 130, size: 10, font: helvetica });
  page.drawText('contact@psillyops.com', { x: 50, y: height - 142, size: 10, font: helvetica });
  
  // Bill To
  let billToY = height - 180;
  page.drawText('Bill To:', { x: 50, y: billToY, size: 12, font: helveticaBold });
  billToY -= 16;
  page.drawText(data.retailerName, { x: 50, y: billToY, size: 10, font: helvetica });
  if (data.retailerAddress) {
    billToY -= 14;
    page.drawText(data.retailerAddress, { x: 50, y: billToY, size: 10, font: helvetica });
  }
  if (data.retailerEmail) {
    billToY -= 14;
    page.drawText(data.retailerEmail, { x: 50, y: billToY, size: 10, font: helvetica });
  }
  
  // Table header
  const tableTop = height - 260;
  page.drawRectangle({ x: 45, y: tableTop - 5, width: 520, height: 20, color: rgb(0.95, 0.96, 0.97) });
  page.drawText('Product', { x: 50, y: tableTop, size: 10, font: helveticaBold });
  page.drawText('SKU', { x: 250, y: tableTop, size: 10, font: helveticaBold });
  page.drawText('Qty', { x: 340, y: tableTop, size: 10, font: helveticaBold });
  page.drawText('Unit Price', { x: 400, y: tableTop, size: 10, font: helveticaBold });
  page.drawText('Total', { x: 480, y: tableTop, size: 10, font: helveticaBold });
  
  // Line items
  let y = tableTop - 25;
  for (const item of data.lineItems) {
    const productName = item.productName.length > 30 ? item.productName.substring(0, 27) + '...' : item.productName;
    page.drawText(productName, { x: 50, y, size: 10, font: helvetica });
    page.drawText(item.sku, { x: 250, y, size: 10, font: helvetica });
    page.drawText(item.quantity.toString(), { x: 360, y, size: 10, font: helvetica });
    page.drawText(formatCurrency(item.unitPrice), { x: 400, y, size: 10, font: helvetica });
    page.drawText(formatCurrency(item.lineTotal), { x: 480, y, size: 10, font: helvetica });
    y -= 20;
  }
  
  // Subtotal line
  y -= 10;
  page.drawLine({ start: { x: 400, y: y + 5 }, end: { x: 560, y: y + 5 }, thickness: 1 });
  y -= 15;
  page.drawText('Subtotal:', { x: 400, y, size: 10, font: helveticaBold });
  page.drawText(formatCurrency(data.subtotal), { x: 480, y, size: 10, font: helveticaBold });
  
  // Notes
  if (data.notes) {
    y -= 40;
    page.drawText('Notes:', { x: 50, y, size: 10, font: helveticaBold });
    y -= 15;
    page.drawText(data.notes, { x: 50, y, size: 10, font: helvetica });
  }
  
  // Footer
  page.drawText('Thank you for your business!', { x: 230, y: 30, size: 8, font: helvetica });
  
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ========================================
// MANIFEST/PACKING SLIP GENERATION
// ========================================

interface ManifestPdfData {
  orderId: string;
  orderNumber: string;
  orderDate: Date;
  status: OrderStatus;
  shippedAt: Date | null;
  trackingNumber: string | null;
  carrier: string | null;
  retailerName: string;
  shippingAddress: string | null;
  createdByAI: boolean;
  lineItems: {
    productName: string;
    sku: string;
    quantityOrdered: number;
    quantityShipped: number | null; // null means not yet shipped, show blank boxes
  }[];
}

// Layout constants for packing slip
const MANIFEST_LAYOUT = {
  PAGE_WIDTH: 612,
  PAGE_HEIGHT: 792,
  MARGIN_LEFT: 36,    // 0.5"
  MARGIN_RIGHT: 36,
  MARGIN_TOP: 36,
  MARGIN_BOTTOM: 36,
  CONTENT_WIDTH: 540,
  
  // Font sizes
  FONT_TITLE: 18,
  FONT_SECTION_HEADER: 12,
  FONT_BODY: 10,
  FONT_SMALL: 8,
  
  // Table column positions (x coordinates)
  TABLE_COL_PRODUCT: 36,
  TABLE_COL_SKU: 280,
  TABLE_COL_ORDERED: 380,
  TABLE_COL_SHIPPED: 440,
  TABLE_COL_NOTES: 500,
  
  // Row heights
  TABLE_HEADER_HEIGHT: 22,
  TABLE_ROW_HEIGHT: 20,
  
  // Header section height (for multi-page)
  HEADER_HEIGHT: 200,
  FOOTER_HEIGHT: 60,
};

// Status badge colors
const STATUS_COLORS: Record<OrderStatus, { bg: [number, number, number]; text: [number, number, number]; label: string }> = {
  DRAFT: { bg: [0.99, 0.95, 0.82], text: [0.7, 0.5, 0.1], label: 'DRAFT' },
  SUBMITTED: { bg: [0.93, 0.95, 1.0], text: [0.2, 0.4, 0.8], label: 'SUBMITTED' },
  APPROVED: { bg: [0.85, 0.94, 1.0], text: [0.1, 0.4, 0.7], label: 'APPROVED' },
  IN_FULFILLMENT: { bg: [0.9, 0.95, 0.9], text: [0.2, 0.6, 0.3], label: 'FULFILLING' },
  SHIPPED: { bg: [0.85, 0.95, 0.85], text: [0.1, 0.5, 0.2], label: 'SHIPPED' },
  CANCELLED: { bg: [0.98, 0.9, 0.9], text: [0.7, 0.2, 0.2], label: 'CANCELLED' },
};

/**
 * Generate PDF buffer for a packing slip/manifest
 */
export async function generateManifestPdf(orderId: string): Promise<Buffer> {
  // Fetch order with all related data
  const order = await prisma.retailerOrder.findUnique({
    where: { id: orderId },
    include: {
      retailer: true,
      lineItems: {
        include: {
          product: true
        }
      }
    }
  });

  if (!order) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found');
  }

  // Determine if order is shipped (show actual quantities) or not (show blank boxes)
  const isShipped = order.status === OrderStatus.SHIPPED;

  // Prepare manifest data
  const data: ManifestPdfData = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderDate: order.createdAt,
    status: order.status,
    shippedAt: order.shippedAt,
    trackingNumber: order.trackingNumber,
    carrier: order.carrier,
    retailerName: order.retailer.name,
    shippingAddress: order.retailer.shippingAddress,
    createdByAI: order.createdByAI,
    lineItems: order.lineItems.map(item => ({
      productName: item.product.name,
      sku: item.product.sku,
      quantityOrdered: item.quantityOrdered,
      quantityShipped: isShipped ? item.quantityAllocated : null
    }))
  };

  return createManifestPdfBuffer(data);
}

/**
 * Load and embed Roboto fonts, with Helvetica fallback
 */
async function embedManifestFonts(pdfDoc: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont }> {
  try {
    // Try to load Roboto fonts
    const robotoRegularPath = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf');
    const robotoBoldPath = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Bold.ttf');
    
    if (fs.existsSync(robotoRegularPath) && fs.existsSync(robotoBoldPath)) {
      const robotoRegularBytes = fs.readFileSync(robotoRegularPath);
      const robotoBoldBytes = fs.readFileSync(robotoBoldPath);
      
      const regular = await pdfDoc.embedFont(robotoRegularBytes);
      const bold = await pdfDoc.embedFont(robotoBoldBytes);
      
      return { regular, bold };
    }
  } catch {
    // Fallback to Helvetica
  }
  
  // Fallback to Helvetica
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  return { regular, bold };
}

/**
 * Generate QR code as PNG buffer for embedding in PDF
 */
async function generateQRCodePng(text: string, size: number = 80): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: 'png',
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' }
  });
}

/**
 * Draw the page header (company info, order details, QR code, status badge)
 */
async function drawManifestHeader(
  page: PDFPage,
  pdfDoc: PDFDocument,
  data: ManifestPdfData,
  fonts: { regular: PDFFont; bold: PDFFont },
  pageNumber: number,
  totalPages: number
): Promise<number> {
  const { PAGE_HEIGHT, MARGIN_LEFT, FONT_TITLE, FONT_SECTION_HEADER, FONT_BODY, FONT_SMALL } = MANIFEST_LAYOUT;
  let y = PAGE_HEIGHT - MANIFEST_LAYOUT.MARGIN_TOP;
  
  // Title
  page.drawText('PSILLYOPS PACKING SLIP', {
    x: MARGIN_LEFT,
    y: y - 20,
    size: FONT_TITLE,
    font: fonts.bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  
  // Status badge (right of title)
  const statusInfo = STATUS_COLORS[data.status];
  const badgeX = 300;
  const badgeY = y - 25;
  const badgeWidth = fonts.bold.widthOfTextAtSize(statusInfo.label, 10) + 16;
  
  page.drawRectangle({
    x: badgeX,
    y: badgeY - 4,
    width: badgeWidth,
    height: 18,
    color: rgb(...statusInfo.bg),
    borderColor: rgb(...statusInfo.text),
    borderWidth: 0.5,
  });
  page.drawText(statusInfo.label, {
    x: badgeX + 8,
    y: badgeY,
    size: 10,
    font: fonts.bold,
    color: rgb(...statusInfo.text),
  });
  
  // QR Code (top right) - links directly to order details page
  try {
    const orderUrl = `${COMPANY_CONFIG.baseUrl}/ops/orders/${data.orderId}`;
    const qrBuffer = await generateQRCodePng(orderUrl, 70);
    const qrImage = await pdfDoc.embedPng(qrBuffer);
    page.drawImage(qrImage, {
      x: 505,
      y: y - 75,
      width: 60,
      height: 60,
    });
  } catch {
    // QR generation failed, skip
  }
  
  y -= 45;
  
  // Order details (right side, below QR)
  let rightY = y - 40;
  const rightX = 420;
  page.drawText(`Order #: ${data.orderNumber}`, { x: rightX, y: rightY, size: FONT_BODY, font: fonts.regular });
  rightY -= 14;
  page.drawText(`Date: ${formatDate(data.orderDate)}`, { x: rightX, y: rightY, size: FONT_BODY, font: fonts.regular });
  if (data.shippedAt) {
    rightY -= 14;
    page.drawText(`Ship Date: ${formatDate(data.shippedAt)}`, { x: rightX, y: rightY, size: FONT_BODY, font: fonts.regular });
  }
  if (data.carrier) {
    rightY -= 14;
    page.drawText(`Carrier: ${data.carrier}`, { x: rightX, y: rightY, size: FONT_BODY, font: fonts.regular });
  }
  if (data.trackingNumber) {
    rightY -= 14;
    page.drawText(`Tracking: ${data.trackingNumber}`, { x: rightX, y: rightY, size: FONT_BODY, font: fonts.regular });
  }
  
  // Company address (left side)
  page.drawText(COMPANY_CONFIG.name, { x: MARGIN_LEFT, y: y, size: FONT_SECTION_HEADER, font: fonts.bold });
  y -= 14;
  const addressLines = COMPANY_CONFIG.formattedWarehouseAddress.split('\n');
  for (const line of addressLines) {
    page.drawText(line, { x: MARGIN_LEFT, y, size: FONT_BODY, font: fonts.regular });
    y -= 12;
  }
  
  y -= 10;
  
  // Ship To section
  page.drawText('Ship To:', { x: MARGIN_LEFT, y, size: FONT_SECTION_HEADER, font: fonts.bold });
  y -= 16;
  page.drawText(data.retailerName, { x: MARGIN_LEFT, y, size: FONT_BODY, font: fonts.bold });
  if (data.shippingAddress) {
    y -= 14;
    // Handle multi-line shipping address
    const addressParts = data.shippingAddress.split('\n');
    for (const part of addressParts) {
      page.drawText(part, { x: MARGIN_LEFT, y, size: FONT_BODY, font: fonts.regular });
      y -= 12;
    }
  }
  
  y -= 15;
  
  // Page indicator for multi-page
  if (totalPages > 1) {
    page.drawText(`Page ${pageNumber} of ${totalPages}`, {
      x: 520,
      y: PAGE_HEIGHT - MANIFEST_LAYOUT.MARGIN_TOP - 5,
      size: FONT_SMALL,
      font: fonts.regular,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
  
  return y;
}

/**
 * Draw the table header row
 */
function drawTableHeader(
  page: PDFPage,
  y: number,
  fonts: { regular: PDFFont; bold: PDFFont }
): number {
  const { TABLE_COL_PRODUCT, TABLE_COL_SKU, TABLE_COL_ORDERED, TABLE_COL_SHIPPED, TABLE_COL_NOTES, CONTENT_WIDTH, MARGIN_LEFT, TABLE_HEADER_HEIGHT, FONT_BODY } = MANIFEST_LAYOUT;
  
  // Header background
  page.drawRectangle({
    x: MARGIN_LEFT - 2,
    y: y - TABLE_HEADER_HEIGHT + 5,
    width: CONTENT_WIDTH + 4,
    height: TABLE_HEADER_HEIGHT,
    color: rgb(0.95, 0.96, 0.97),
  });
  
  // Column headers
  page.drawText('Product', { x: TABLE_COL_PRODUCT, y: y - 12, size: FONT_BODY, font: fonts.bold });
  page.drawText('SKU', { x: TABLE_COL_SKU, y: y - 12, size: FONT_BODY, font: fonts.bold });
  page.drawText('Ordered', { x: TABLE_COL_ORDERED, y: y - 12, size: FONT_BODY, font: fonts.bold });
  page.drawText('Shipped', { x: TABLE_COL_SHIPPED, y: y - 12, size: FONT_BODY, font: fonts.bold });
  page.drawText('Notes', { x: TABLE_COL_NOTES, y: y - 12, size: FONT_BODY, font: fonts.bold });
  
  return y - TABLE_HEADER_HEIGHT;
}

/**
 * Draw a single line item row
 */
function drawLineItemRow(
  page: PDFPage,
  y: number,
  item: ManifestPdfData['lineItems'][0],
  rowIndex: number,
  fonts: { regular: PDFFont; bold: PDFFont }
): void {
  const { TABLE_COL_PRODUCT, TABLE_COL_SKU, TABLE_COL_ORDERED, TABLE_COL_SHIPPED, TABLE_COL_NOTES, CONTENT_WIDTH, MARGIN_LEFT, TABLE_ROW_HEIGHT, FONT_BODY } = MANIFEST_LAYOUT;
  
  // Alternate row shading
  if (rowIndex % 2 === 1) {
    page.drawRectangle({
      x: MARGIN_LEFT - 2,
      y: y - TABLE_ROW_HEIGHT + 5,
      width: CONTENT_WIDTH + 4,
      height: TABLE_ROW_HEIGHT,
      color: rgb(0.98, 0.98, 0.98),
    });
  }
  
  // Truncate long product names
  let productName = item.productName;
  if (productName.length > 38) {
    productName = productName.substring(0, 35) + '...';
  }
  
  page.drawText(productName, { x: TABLE_COL_PRODUCT, y: y - 12, size: FONT_BODY, font: fonts.regular });
  page.drawText(item.sku, { x: TABLE_COL_SKU, y: y - 12, size: FONT_BODY, font: fonts.regular });
  
  // Right-align ordered quantity
  const orderedText = item.quantityOrdered.toString();
  const orderedWidth = fonts.regular.widthOfTextAtSize(orderedText, FONT_BODY);
  page.drawText(orderedText, { x: TABLE_COL_ORDERED + 30 - orderedWidth, y: y - 12, size: FONT_BODY, font: fonts.regular });
  
  // Shipped quantity: show number if shipped, or blank box if not
  if (item.quantityShipped !== null) {
    const shippedText = item.quantityShipped.toString();
    const shippedWidth = fonts.regular.widthOfTextAtSize(shippedText, FONT_BODY);
    page.drawText(shippedText, { x: TABLE_COL_SHIPPED + 30 - shippedWidth, y: y - 12, size: FONT_BODY, font: fonts.regular });
  } else {
    // Draw blank box for handwriting
    page.drawRectangle({
      x: TABLE_COL_SHIPPED + 5,
      y: y - 15,
      width: 25,
      height: 14,
      borderWidth: 0.5,
      borderColor: rgb(0.6, 0.6, 0.6),
    });
  }
  
  // Notes column: blank for handwriting
  page.drawLine({
    start: { x: TABLE_COL_NOTES, y: y - 14 },
    end: { x: TABLE_COL_NOTES + 70, y: y - 14 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
}

/**
 * Draw verification section and totals
 */
function drawVerificationSection(
  page: PDFPage,
  y: number,
  data: ManifestPdfData,
  fonts: { regular: PDFFont; bold: PDFFont }
): number {
  const { MARGIN_LEFT, FONT_BODY, FONT_SECTION_HEADER } = MANIFEST_LAYOUT;
  
  // Totals summary
  const totalSkus = data.lineItems.length;
  const totalUnits = data.lineItems.reduce((sum, item) => sum + item.quantityOrdered, 0);
  
  y -= 15;
  page.drawText(`Total SKUs: ${totalSkus}`, { x: MARGIN_LEFT, y, size: FONT_BODY, font: fonts.bold });
  page.drawText(`Total Units: ${totalUnits}`, { x: MARGIN_LEFT + 120, y, size: FONT_BODY, font: fonts.bold });
  
  y -= 30;
  
  // Verification section header
  page.drawText('Verification:', { x: MARGIN_LEFT, y, size: FONT_SECTION_HEADER, font: fonts.bold });
  y -= 20;
  
  // Checkbox: Items verified
  page.drawRectangle({ x: MARGIN_LEFT, y: y - 2, width: 12, height: 12, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  page.drawText('Items verified', { x: MARGIN_LEFT + 18, y, size: FONT_BODY, font: fonts.regular });
  
  // Checkbox: Damaged items noted
  page.drawRectangle({ x: MARGIN_LEFT + 150, y: y - 2, width: 12, height: 12, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  page.drawText('Damaged items noted', { x: MARGIN_LEFT + 168, y, size: FONT_BODY, font: fonts.regular });
  
  y -= 25;
  
  // Packed by line
  page.drawText('Packed by:', { x: MARGIN_LEFT, y, size: FONT_BODY, font: fonts.regular });
  page.drawLine({
    start: { x: MARGIN_LEFT + 60, y: y - 2 },
    end: { x: MARGIN_LEFT + 250, y: y - 2 },
    thickness: 0.5,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  y -= 20;
  
  // Date line
  page.drawText('Date:', { x: MARGIN_LEFT, y, size: FONT_BODY, font: fonts.regular });
  page.drawLine({
    start: { x: MARGIN_LEFT + 35, y: y - 2 },
    end: { x: MARGIN_LEFT + 150, y: y - 2 },
    thickness: 0.5,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  return y;
}

/**
 * Draw footer with generation info and AI/Manual attribution
 */
function drawManifestFooter(
  page: PDFPage,
  data: ManifestPdfData,
  fonts: { regular: PDFFont; bold: PDFFont }
): void {
  const { PAGE_WIDTH, MARGIN_BOTTOM, FONT_SMALL } = MANIFEST_LAYOUT;
  const y = MARGIN_BOTTOM + 10;
  
  // Generation timestamp (left)
  const generatedText = `Generated by PsillyOps on ${new Date().toLocaleDateString()}`;
  page.drawText(generatedText, {
    x: MANIFEST_LAYOUT.MARGIN_LEFT,
    y,
    size: FONT_SMALL,
    font: fonts.regular,
    color: rgb(0.5, 0.5, 0.5),
  });
  
  // AI/Manual attribution (right)
  const attributionText = data.createdByAI ? 'AI Created / Human Verified' : 'Manually Created';
  const attributionWidth = fonts.regular.widthOfTextAtSize(attributionText, FONT_SMALL);
  page.drawText(attributionText, {
    x: PAGE_WIDTH - MANIFEST_LAYOUT.MARGIN_RIGHT - attributionWidth,
    y,
    size: FONT_SMALL,
    font: fonts.regular,
    color: rgb(0.5, 0.5, 0.5),
  });
}

/**
 * Draw watermark for unshipped orders
 */
function drawWatermark(page: PDFPage, status: OrderStatus, fonts: { regular: PDFFont; bold: PDFFont }): void {
  // Only show watermark for DRAFT and SUBMITTED statuses
  if (status !== OrderStatus.DRAFT && status !== OrderStatus.SUBMITTED) {
    return;
  }
  
  const { PAGE_WIDTH, PAGE_HEIGHT } = MANIFEST_LAYOUT;
  const watermarkText = status === OrderStatus.DRAFT ? 'DRAFT' : 'PENDING APPROVAL';
  
  // Draw diagonal watermark
  page.drawText(watermarkText, {
    x: PAGE_WIDTH / 2 - 100,
    y: PAGE_HEIGHT / 2,
    size: 60,
    font: fonts.bold,
    color: rgb(0.9, 0.9, 0.9),
    rotate: degrees(-35),
    opacity: 0.3,
  });
}

/**
 * Create the actual PDF buffer for a manifest/packing slip
 * Supports multi-page for large orders
 */
async function createManifestPdfBuffer(data: ManifestPdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fonts = await embedManifestFonts(pdfDoc);
  
  const { PAGE_WIDTH, PAGE_HEIGHT, MARGIN_BOTTOM, TABLE_ROW_HEIGHT, HEADER_HEIGHT, FOOTER_HEIGHT } = MANIFEST_LAYOUT;
  
  // Calculate how many items fit per page
  const contentAreaHeight = PAGE_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT - 100; // 100 for verification section
  const itemsPerPage = Math.floor(contentAreaHeight / TABLE_ROW_HEIGHT);
  const totalPages = Math.ceil(data.lineItems.length / itemsPerPage);
  
  let itemIndex = 0;
  
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    
    // Draw watermark first (behind content)
    drawWatermark(page, data.status, fonts);
    
    // Draw header
    let y = await drawManifestHeader(page, pdfDoc, data, fonts, pageNum, totalPages);
    
    // Draw table header
    y = drawTableHeader(page, y, fonts);
    
    // Draw line items for this page
    const pageStartIndex = itemIndex;
    const pageEndIndex = Math.min(itemIndex + itemsPerPage, data.lineItems.length);
    
    for (let i = pageStartIndex; i < pageEndIndex; i++) {
      y -= TABLE_ROW_HEIGHT;
      drawLineItemRow(page, y, data.lineItems[i], i - pageStartIndex, fonts);
      itemIndex++;
    }
    
    // Draw verification section only on last page
    if (pageNum === totalPages) {
      drawVerificationSection(page, y - TABLE_ROW_HEIGHT, data, fonts);
    }
    
    // Draw footer on every page
    drawManifestFooter(page, data, fonts);
  }
  
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ========================================
// QUERY FUNCTIONS
// ========================================

/**
 * Get invoice by ID
 */
export async function getInvoice(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      retailer: true,
      order: {
        include: {
          lineItems: {
            include: {
              product: true
            }
          }
        }
      }
    }
  });
}

/**
 * Get invoice by order ID
 */
export async function getInvoiceByOrderId(orderId: string) {
  return prisma.invoice.findFirst({
    where: { orderId },
    include: {
      retailer: true,
      order: {
        include: {
          lineItems: {
            include: {
              product: true
            }
          }
        }
      }
    }
  });
}

/**
 * Get all invoices with optional filters
 */
export async function getInvoices(filters?: {
  retailerId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}) {
  const where: any = {};
  
  if (filters?.retailerId) {
    where.retailerId = filters.retailerId;
  }
  
  if (filters?.startDate || filters?.endDate) {
    where.issuedAt = {};
    if (filters.startDate) where.issuedAt.gte = filters.startDate;
    if (filters.endDate) where.issuedAt.lte = filters.endDate;
  }

  return prisma.invoice.findMany({
    where,
    include: {
      retailer: true,
      order: true
    },
    orderBy: { issuedAt: 'desc' },
    take: filters?.limit ?? 100
  });
}

/**
 * Get orders that are shipped but not invoiced
 */
export async function getOrdersAwaitingInvoice() {
  return prisma.retailerOrder.findMany({
    where: {
      status: 'SHIPPED',
      invoices: {
        none: {}
      }
    },
    include: {
      retailer: true,
      lineItems: {
        include: {
          product: true
        }
      }
    },
    orderBy: { shippedAt: 'asc' }
  });
}

/**
 * Count orders awaiting invoice
 */
export async function countOrdersAwaitingInvoice(): Promise<number> {
  return prisma.retailerOrder.count({
    where: {
      status: 'SHIPPED',
      invoices: {
        none: {}
      }
    }
  });
}



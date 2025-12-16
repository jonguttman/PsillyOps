// INVOICE SERVICE - Invoice and manifest generation
// ALL business logic for invoicing and document generation

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction, generateSummary } from './loggingService';
import { ActivityEntity } from '@prisma/client';
import { generateOrderNumber, formatCurrency, formatDate } from '@/lib/utils/formatters';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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
  orderNumber: string;
  createdAt: Date;
  shippedAt: Date | null;
  trackingNumber: string | null;
  retailerName: string;
  shippingAddress: string | null;
  lineItems: {
    productName: string;
    sku: string;
    quantity: number;
    allocated: number;
  }[];
}

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

  // Prepare manifest data
  const data: ManifestPdfData = {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    shippedAt: order.shippedAt,
    trackingNumber: order.trackingNumber,
    retailerName: order.retailer.name,
    shippingAddress: order.retailer.shippingAddress,
    lineItems: order.lineItems.map(item => ({
      productName: item.product.name,
      sku: item.product.sku,
      quantity: item.quantityOrdered,
      allocated: item.quantityAllocated
    }))
  };

  return createManifestPdfBuffer(data);
}

/**
 * Create the actual PDF buffer for a manifest/packing slip
 */
async function createManifestPdfBuffer(data: ManifestPdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { height } = page.getSize();
  
  // Embed fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Header
  page.drawText('PACKING SLIP', {
    x: 220,
    y: height - 50,
    size: 24,
    font: helveticaBold,
  });
  
  // Order details (right aligned)
  let rightY = height - 80;
  page.drawText(`Order #: ${data.orderNumber}`, { x: 400, y: rightY, size: 10, font: helvetica });
  rightY -= 14;
  page.drawText(`Order Date: ${formatDate(data.createdAt)}`, { x: 400, y: rightY, size: 10, font: helvetica });
  if (data.shippedAt) {
    rightY -= 14;
    page.drawText(`Ship Date: ${formatDate(data.shippedAt)}`, { x: 400, y: rightY, size: 10, font: helvetica });
  }
  if (data.trackingNumber) {
    rightY -= 14;
    page.drawText(`Tracking #: ${data.trackingNumber}`, { x: 400, y: rightY, size: 10, font: helvetica });
  }
  
  // Company header
  page.drawText('PsillyOps', { x: 50, y: height - 100, size: 14, font: helveticaBold });
  page.drawText('123 Business Street', { x: 50, y: height - 118, size: 10, font: helvetica });
  page.drawText('City, State 12345', { x: 50, y: height - 130, size: 10, font: helvetica });
  
  // Ship To
  let shipToY = height - 170;
  page.drawText('Ship To:', { x: 50, y: shipToY, size: 12, font: helveticaBold });
  shipToY -= 16;
  page.drawText(data.retailerName, { x: 50, y: shipToY, size: 10, font: helvetica });
  if (data.shippingAddress) {
    shipToY -= 14;
    page.drawText(data.shippingAddress, { x: 50, y: shipToY, size: 10, font: helvetica });
  }
  
  // Table header
  const tableTop = height - 240;
  page.drawRectangle({ x: 45, y: tableTop - 5, width: 520, height: 20, color: rgb(0.95, 0.96, 0.97) });
  page.drawText('Product', { x: 50, y: tableTop, size: 10, font: helveticaBold });
  page.drawText('SKU', { x: 280, y: tableTop, size: 10, font: helveticaBold });
  page.drawText('Ordered', { x: 380, y: tableTop, size: 10, font: helveticaBold });
  page.drawText('Ship Qty', { x: 480, y: tableTop, size: 10, font: helveticaBold });
  
  // Line items
  let y = tableTop - 25;
  for (const item of data.lineItems) {
    const productName = item.productName.length > 35 ? item.productName.substring(0, 32) + '...' : item.productName;
    page.drawText(productName, { x: 50, y, size: 10, font: helvetica });
    page.drawText(item.sku, { x: 280, y, size: 10, font: helvetica });
    page.drawText(item.quantity.toString(), { x: 400, y, size: 10, font: helvetica });
    page.drawText(item.allocated.toString(), { x: 500, y, size: 10, font: helvetica });
    y -= 20;
  }
  
  // Verification section
  y -= 30;
  page.drawText('Verification:', { x: 50, y, size: 10, font: helveticaBold });
  y -= 18;
  page.drawRectangle({ x: 50, y: y - 2, width: 12, height: 12, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  page.drawText('Items verified', { x: 70, y, size: 10, font: helvetica });
  y -= 20;
  page.drawRectangle({ x: 50, y: y - 2, width: 12, height: 12, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  page.drawText('Packed by: _____________________', { x: 70, y, size: 10, font: helvetica });
  y -= 20;
  page.drawRectangle({ x: 50, y: y - 2, width: 12, height: 12, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  page.drawText('Date: _____________________', { x: 70, y, size: 10, font: helvetica });
  
  // Footer
  page.drawText(`Generated on ${new Date().toLocaleDateString()}`, { x: 230, y: 30, size: 8, font: helvetica });
  
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



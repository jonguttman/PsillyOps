// INVOICE SERVICE - Invoice and manifest generation
// ALL business logic for invoicing and document generation

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction, generateSummary } from './loggingService';
import { ActivityEntity } from '@prisma/client';
import { generateOrderNumber, formatCurrency, formatDate } from '@/lib/utils/formatters';
import PDFDocument from 'pdfkit';

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
      details: {
        orderNumber: order.orderNumber,
        retailer: order.retailer.name
      }
    }),
    details: {
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
function createInvoicePdfBuffer(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
    doc.moveDown(0.5);

    // Invoice details
    doc.fontSize(10).font('Helvetica');
    doc.text(`Invoice #: ${data.invoiceNo}`, { align: 'right' });
    doc.text(`Date: ${formatDate(data.issuedAt)}`, { align: 'right' });
    doc.text(`Order #: ${data.orderNumber}`, { align: 'right' });
    doc.moveDown();

    // Company header (placeholder - could be configurable)
    doc.fontSize(14).font('Helvetica-Bold').text('PsillyOps', 50, 100);
    doc.fontSize(10).font('Helvetica')
      .text('123 Business Street', 50, 118)
      .text('City, State 12345', 50, 130)
      .text('contact@psillyops.com', 50, 142);

    // Bill To
    doc.moveDown(2);
    const billToY = doc.y;
    doc.fontSize(12).font('Helvetica-Bold').text('Bill To:', 50, billToY);
    doc.fontSize(10).font('Helvetica');
    doc.text(data.retailerName, 50, billToY + 16);
    if (data.retailerAddress) {
      doc.text(data.retailerAddress, 50, doc.y);
    }
    if (data.retailerEmail) {
      doc.text(data.retailerEmail, 50, doc.y);
    }
    doc.moveDown(2);

    // Line items table header
    const tableTop = doc.y + 20;
    const col1 = 50;
    const col2 = 250;
    const col3 = 340;
    const col4 = 410;
    const col5 = 480;

    doc.fontSize(10).font('Helvetica-Bold');
    doc.rect(col1 - 5, tableTop - 5, 520, 20).fill('#f3f4f6');
    doc.fillColor('#000000');
    doc.text('Product', col1, tableTop);
    doc.text('SKU', col2, tableTop);
    doc.text('Qty', col3, tableTop, { width: 60, align: 'right' });
    doc.text('Unit Price', col4, tableTop, { width: 60, align: 'right' });
    doc.text('Total', col5, tableTop, { width: 70, align: 'right' });

    // Line items
    doc.font('Helvetica');
    let y = tableTop + 25;
    
    for (const item of data.lineItems) {
      // Check if we need a new page
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      doc.text(item.productName, col1, y, { width: 190 });
      doc.text(item.sku, col2, y);
      doc.text(item.quantity.toString(), col3, y, { width: 60, align: 'right' });
      doc.text(formatCurrency(item.unitPrice), col4, y, { width: 60, align: 'right' });
      doc.text(formatCurrency(item.lineTotal), col5, y, { width: 70, align: 'right' });
      
      y += 20;
    }

    // Subtotal
    y += 10;
    doc.moveTo(col4, y).lineTo(col5 + 70, y).stroke();
    y += 10;
    doc.font('Helvetica-Bold');
    doc.text('Subtotal:', col4, y, { width: 60, align: 'right' });
    doc.text(formatCurrency(data.subtotal), col5, y, { width: 70, align: 'right' });

    // Notes
    if (data.notes) {
      y += 40;
      doc.font('Helvetica-Bold').text('Notes:', col1, y);
      y += 15;
      doc.font('Helvetica').text(data.notes, col1, y, { width: 500 });
    }

    // Footer
    doc.fontSize(8).font('Helvetica').text(
      'Thank you for your business!',
      50,
      doc.page.height - 50,
      { align: 'center' }
    );

    doc.end();
  });
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
function createManifestPdfBuffer(data: ManifestPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('PACKING SLIP', { align: 'center' });
    doc.moveDown(0.5);

    // Order details
    doc.fontSize(10).font('Helvetica');
    doc.text(`Order #: ${data.orderNumber}`, { align: 'right' });
    doc.text(`Order Date: ${formatDate(data.createdAt)}`, { align: 'right' });
    if (data.shippedAt) {
      doc.text(`Ship Date: ${formatDate(data.shippedAt)}`, { align: 'right' });
    }
    if (data.trackingNumber) {
      doc.text(`Tracking #: ${data.trackingNumber}`, { align: 'right' });
    }
    doc.moveDown();

    // From (Company)
    doc.fontSize(14).font('Helvetica-Bold').text('PsillyOps', 50, 100);
    doc.fontSize(10).font('Helvetica')
      .text('123 Business Street', 50, 118)
      .text('City, State 12345', 50, 130);

    // Ship To
    doc.moveDown(2);
    const shipToY = doc.y;
    doc.fontSize(12).font('Helvetica-Bold').text('Ship To:', 50, shipToY);
    doc.fontSize(10).font('Helvetica');
    doc.text(data.retailerName, 50, shipToY + 16);
    if (data.shippingAddress) {
      doc.text(data.shippingAddress, 50, doc.y);
    }
    doc.moveDown(2);

    // Items table header
    const tableTop = doc.y + 20;
    const col1 = 50;
    const col2 = 280;
    const col3 = 380;
    const col4 = 450;

    doc.fontSize(10).font('Helvetica-Bold');
    doc.rect(col1 - 5, tableTop - 5, 520, 20).fill('#f3f4f6');
    doc.fillColor('#000000');
    doc.text('Product', col1, tableTop);
    doc.text('SKU', col2, tableTop);
    doc.text('Ordered', col3, tableTop, { width: 60, align: 'right' });
    doc.text('Ship Qty', col4, tableTop, { width: 80, align: 'right' });

    // Line items
    doc.font('Helvetica');
    let y = tableTop + 25;
    
    for (const item of data.lineItems) {
      // Check if we need a new page
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      doc.text(item.productName, col1, y, { width: 220 });
      doc.text(item.sku, col2, y);
      doc.text(item.quantity.toString(), col3, y, { width: 60, align: 'right' });
      doc.text(item.allocated.toString(), col4, y, { width: 80, align: 'right' });
      
      y += 20;
    }

    // Checkbox area for verification
    y += 30;
    doc.font('Helvetica-Bold').text('Verification:', col1, y);
    y += 18;
    doc.font('Helvetica');
    doc.rect(col1, y, 12, 12).stroke();
    doc.text('Items verified', col1 + 20, y);
    y += 20;
    doc.rect(col1, y, 12, 12).stroke();
    doc.text('Packed by: _____________________', col1 + 20, y);
    y += 20;
    doc.rect(col1, y, 12, 12).stroke();
    doc.text('Date: _____________________', col1 + 20, y);

    // Footer
    doc.fontSize(8).font('Helvetica').text(
      `Generated on ${new Date().toLocaleDateString()}`,
      50,
      doc.page.height - 50,
      { align: 'center' }
    );

    doc.end();
  });
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



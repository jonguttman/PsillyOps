/**
 * GET /api/catalog/[token]/pdf
 *
 * Generate and download a PDF catalog for the retailer.
 * Tracks download for analytics.
 */

import { NextRequest } from 'next/server';
import PDFDocument from 'pdfkit';
import {
  getCatalogLinkByToken,
  getCatalogProducts,
  trackPdfDownload
} from '@/lib/services/catalogLinkService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Validate token
    const catalogLink = await getCatalogLinkByToken(token);

    if (!catalogLink) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Catalog not found' },
        { status: 404 }
      );
    }

    if (catalogLink.status !== 'ACTIVE') {
      return Response.json(
        { code: 'INVALID_STATUS', message: 'This catalog is no longer available' },
        { status: 400 }
      );
    }

    // Check expiration
    if (catalogLink.expiresAt && catalogLink.expiresAt < new Date()) {
      return Response.json(
        { code: 'EXPIRED', message: 'This catalog has expired' },
        { status: 400 }
      );
    }

    // Get products
    const products = await getCatalogProducts(catalogLink.id);
    const displayName = catalogLink.displayName || catalogLink.retailer.name;

    // Track the download (skip for internal/admin views)
    const { searchParams } = new URL(req.url);
    const isInternal = searchParams.get('internal') === 'true';
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;
    await trackPdfDownload(catalogLink.id, { ip, userAgent }, { skipTracking: isInternal });

    // Generate PDF
    const pdfBuffer = await generateCatalogPdf(displayName, products);

    // Return PDF - convert Buffer to Uint8Array for Response compatibility
    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="catalog-${displayName.replace(/[^a-zA-Z0-9]/g, '-')}.pdf"`,
        'Content-Length': pdfBuffer.length.toString()
      }
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  effectivePrice: number | null;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

async function generateCatalogPdf(
  displayName: string,
  products: Product[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 50,
        info: {
          Title: `Product Catalog - ${displayName}`,
          Author: 'PsillyOps',
          Subject: 'Wholesale Product Catalog'
        }
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('Product Catalog', { align: 'center' });

      doc
        .fontSize(12)
        .font('Helvetica')
        .fillColor('#666666')
        .text(`Prepared for: ${displayName}`, { align: 'center' });

      doc
        .text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });

      doc.moveDown(2);

      // Divider
      doc
        .strokeColor('#cccccc')
        .lineWidth(1)
        .moveTo(50, doc.y)
        .lineTo(562, doc.y)
        .stroke();

      doc.moveDown(1);

      // Products
      const stockLabels = {
        IN_STOCK: 'In Stock',
        LOW_STOCK: 'Low Stock',
        OUT_OF_STOCK: 'Out of Stock'
      };

      products.forEach((product, index) => {
        // Check if we need a new page
        if (doc.y > 680) {
          doc.addPage();
        }

        // Product entry
        doc
          .fillColor('#000000')
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(product.name);

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#666666')
          .text(`SKU: ${product.sku}`);

        if (product.description) {
          doc
            .fontSize(10)
            .fillColor('#444444')
            .text(product.description, { width: 400 });
        }

        // Price and stock on same line
        const priceText = product.effectivePrice !== null
          ? `$${product.effectivePrice.toFixed(2)}`
          : 'Contact for pricing';

        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text(priceText, 50, doc.y + 5, { continued: true })
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#666666')
          .text(`  |  ${stockLabels[product.stockStatus]}`);

        doc.moveDown(1);

        // Divider between products
        if (index < products.length - 1) {
          doc
            .strokeColor('#eeeeee')
            .lineWidth(0.5)
            .moveTo(50, doc.y)
            .lineTo(562, doc.y)
            .stroke();

          doc.moveDown(0.5);
        }
      });

      // Footer
      doc.moveDown(2);
      doc
        .fontSize(9)
        .fillColor('#999999')
        .text('All prices are wholesale. Contact us for volume discounts.', { align: 'center' });

      doc
        .text(`© ${new Date().getFullYear()} PsillyOps`, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * GET /api/catalog/[token]/qr
 *
 * Generate a QR code image for the catalog link.
 * Supports PNG and SVG formats.
 */

import { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import {
  getCatalogLinkByToken,
  buildCatalogUrl
} from '@/lib/services/catalogLinkService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { searchParams } = new URL(req.url);

    // Get options from query params
    const format = searchParams.get('format') || 'png';
    const size = Math.min(Math.max(parseInt(searchParams.get('size') || '300', 10), 100), 1000);

    // Validate token exists
    const catalogLink = await getCatalogLinkByToken(token);

    if (!catalogLink) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Catalog not found' },
        { status: 404 }
      );
    }

    // Build the catalog URL
    const catalogUrl = buildCatalogUrl(token);

    // Generate QR code
    if (format === 'svg') {
      const svg = await QRCode.toString(catalogUrl, {
        type: 'svg',
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      return new Response(svg, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    } else {
      // PNG format
      const pngBuffer = await QRCode.toBuffer(catalogUrl, {
        type: 'png',
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      return new Response(pngBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': pngBuffer.length.toString(),
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }
  } catch (error) {
    console.error('QR code generation error:', error);
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
}

/**
 * Seal Tuner Export API
 * 
 * Exports print calibration PDFs with multiple sizes on separate pages.
 * Each page includes cut guides and embedded configuration.
 * 
 * POST body:
 * {
 *   config: SporeFieldConfig,
 *   sizes: number[],  // Array of diameters in inches (e.g., [1.25, 1.5, 2.0])
 *   paperSize: 'letter' | 'a4'
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { generateSealSvg } from '@/lib/services/sealGeneratorService';
import { SEAL_VERSION } from '@/lib/constants/seal';
import { TUNER_PREVIEW_TOKEN } from '@/lib/types/sealConfig';
import type { SporeFieldConfig } from '@/lib/types/sealConfig';
import { validateConfig } from '@/lib/constants/sealPresets';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';

// Paper dimensions in points (72 points = 1 inch)
const PAPER_SIZES = {
  letter: { width: 612, height: 792 },  // 8.5" x 11"
  a4: { width: 595, height: 842 },      // 210mm x 297mm
};

// Margins in points
const MARGIN = 36; // 0.5 inch

interface ExportRequest {
  config: SporeFieldConfig;
  sizes: number[];
  paperSize: 'letter' | 'a4';
}

export async function POST(request: NextRequest) {
  try {
    // Require authentication (ADMIN or WAREHOUSE)
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userRole = session.user.role;
    if (userRole !== 'ADMIN' && userRole !== 'WAREHOUSE') {
      return NextResponse.json(
        { error: 'Forbidden: ADMIN or WAREHOUSE role required' },
        { status: 403 }
      );
    }
    
    const body = await request.json() as ExportRequest;
    const { config, sizes, paperSize } = body;
    
    if (!config || !sizes || sizes.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: config, sizes' },
        { status: 400 }
      );
    }
    
    // Validate config
    const errors = validateConfig(config);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Invalid config', details: errors },
        { status: 400 }
      );
    }
    
    // Validate sizes
    for (const size of sizes) {
      if (size < 0.5 || size > 4) {
        return NextResponse.json(
          { error: `Invalid size ${size}: must be between 0.5 and 4 inches` },
          { status: 400 }
        );
      }
    }
    
    const paper = PAPER_SIZES[paperSize] || PAPER_SIZES.letter;
    
    // Generate SVG for the tuner preview token
    const svg = await generateSealSvg(TUNER_PREVIEW_TOKEN, SEAL_VERSION, config);
    
    // Create PDF document
    const doc = new PDFDocument({
      size: [paper.width, paper.height],
      margin: MARGIN,
    });
    
    // Collect PDF chunks
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    
    const pdfComplete = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
    
    // Generate a page for each size
    for (let i = 0; i < sizes.length; i++) {
      if (i > 0) {
        doc.addPage();
      }
      
      const sizeInches = sizes[i];
      const sizePoints = sizeInches * 72;
      
      // Calculate available area
      const availableWidth = paper.width - 2 * MARGIN;
      const availableHeight = paper.height - 2 * MARGIN - 100; // Reserve space for info
      
      // Calculate how many seals fit
      const cols = Math.floor(availableWidth / sizePoints);
      const rows = Math.floor(availableHeight / sizePoints);
      const sealsPerPage = cols * rows;
      
      // Center the grid
      const gridWidth = cols * sizePoints;
      const gridHeight = rows * sizePoints;
      const startX = MARGIN + (availableWidth - gridWidth) / 2;
      const startY = MARGIN + 60; // Leave room for header
      
      // Draw header
      doc.fontSize(16).font('Helvetica-Bold')
        .text(`TripDAR Seal Calibration - ${sizeInches}" Diameter`, MARGIN, MARGIN);
      
      doc.fontSize(10).font('Helvetica')
        .text(`Preset: ${config.basePreset} | QR Scale: ${((config.qrScale ?? 1) * 100).toFixed(0)}% | Spore Count: ${config.sporeCount.toLocaleString()}`, MARGIN, MARGIN + 20);
      
      doc.fontSize(8).fillColor('#666')
        .text(`Generated: ${new Date().toISOString()} | Token: TUNER_PREVIEW_001 (test only)`, MARGIN, MARGIN + 35);
      
      doc.fillColor('#000');
      
      // Draw cut guides (dashed circles)
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const centerX = startX + col * sizePoints + sizePoints / 2;
          const centerY = startY + row * sizePoints + sizePoints / 2;
          const radius = sizePoints / 2 - 2; // Slight inset for cut guide
          
          // Draw dashed circle cut guide
          doc.save()
            .circle(centerX, centerY, radius)
            .dash(3, { space: 3 })
            .strokeColor('#ccc')
            .lineWidth(0.5)
            .stroke()
            .undash()
            .restore();
          
          // Draw the seal SVG
          const sealX = centerX - sizePoints / 2 + 2;
          const sealY = centerY - sizePoints / 2 + 2;
          const sealSize = sizePoints - 4;
          
          try {
            SVGtoPDF(doc, svg, sealX, sealY, {
              width: sealSize,
              height: sealSize,
              preserveAspectRatio: 'xMidYMid meet',
            });
          } catch (svgError) {
            console.error('SVG rendering error:', svgError);
            // Draw placeholder
            doc.rect(sealX, sealY, sealSize, sealSize)
              .strokeColor('#f00')
              .stroke();
          }
        }
      }
      
      // Draw footer with config details
      const footerY = paper.height - MARGIN - 60;
      
      doc.fontSize(7).fillColor('#999');
      doc.text(`Configuration: ${JSON.stringify({
        basePreset: config.basePreset,
        qrScale: config.qrScale,
        sporeCount: config.sporeCount,
        zoneAEnd: config.zoneAEnd,
        zoneBEnd: config.zoneBEnd,
        quietCoreFactor: config.quietCoreFactor,
        moduleContrastBoost: config.moduleContrastBoost,
      })}`, MARGIN, footerY, {
        width: paper.width - 2 * MARGIN,
        align: 'center',
      });
      
      doc.text(`Page ${i + 1} of ${sizes.length} | ${sealsPerPage} seals per page at ${sizeInches}" | Paper: ${paperSize.toUpperCase()}`, MARGIN, footerY + 20, {
        width: paper.width - 2 * MARGIN,
        align: 'center',
      });
    }
    
    doc.end();
    
    const pdfBuffer = await pdfComplete;
    
    // Return PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="seal-calibration-${new Date().toISOString().split('T')[0]}.pdf"`,
      },
    });
    
  } catch (error) {
    console.error('[Tuner Export] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate calibration PDF' },
      { status: 500 }
    );
  }
}


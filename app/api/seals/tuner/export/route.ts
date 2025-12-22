/**
 * Seal Tuner Export API — Calibration Mode
 * 
 * Exports a single-page calibration PDF with one seal per selected size.
 * Designed for visual comparison and scan testing, NOT production printing.
 * 
 * Features:
 * - One seal per size on a single page
 * - Grid layout with generous spacing
 * - Size label under each seal
 * - No cut guides (clean presentation)
 * - Configuration summary at bottom
 * - Uses TUNER_PREVIEW_001 token (test only)
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
const HEADER_HEIGHT = 60;
const FOOTER_HEIGHT = 80;
const LABEL_HEIGHT = 20;
const SPACING = 24; // Generous spacing between seals

interface ExportRequest {
  config: SporeFieldConfig;
  sizes: number[];
  paperSize: 'letter' | 'a4';
}

/**
 * Calculate grid layout for seals
 * Returns positions for each seal to fit on a single page
 */
function calculateGridLayout(
  sizes: number[],
  availableWidth: number,
  availableHeight: number
): { x: number; y: number; sizePoints: number }[] {
  const positions: { x: number; y: number; sizePoints: number }[] = [];
  
  // Convert sizes to points
  const sizesInPoints = sizes.map(s => s * 72);
  
  // Try different grid configurations
  const count = sizes.length;
  
  // Determine optimal rows/cols based on count
  let cols: number;
  let rows: number;
  
  if (count <= 3) {
    cols = count;
    rows = 1;
  } else if (count <= 6) {
    cols = 3;
    rows = Math.ceil(count / 3);
  } else {
    cols = 4;
    rows = Math.ceil(count / 4);
  }
  
  // Calculate cell size based on largest seal
  const maxSizePoints = Math.max(...sizesInPoints);
  const cellWidth = (availableWidth - SPACING * (cols - 1)) / cols;
  const cellHeight = (availableHeight - SPACING * (rows - 1) - LABEL_HEIGHT * rows) / rows;
  
  // Scale factor to fit largest seal in cell
  const scaleFactor = Math.min(cellWidth / maxSizePoints, cellHeight / maxSizePoints, 1);
  
  // Position each seal
  for (let i = 0; i < sizes.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    
    const cellX = col * (cellWidth + SPACING);
    const cellY = row * (cellHeight + SPACING + LABEL_HEIGHT);
    
    // Scale the seal size
    const scaledSize = sizesInPoints[i] * scaleFactor;
    
    // Center seal in cell
    const x = cellX + (cellWidth - scaledSize) / 2;
    const y = cellY + (cellHeight - scaledSize) / 2;
    
    positions.push({ x, y, sizePoints: scaledSize });
  }
  
  return positions;
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
      if (size < 0.25 || size > 4) {
        return NextResponse.json(
          { error: `Invalid size ${size}: must be between 0.25 and 4 inches` },
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
    
    // Calculate available area for seals
    const availableWidth = paper.width - 2 * MARGIN;
    const availableHeight = paper.height - 2 * MARGIN - HEADER_HEIGHT - FOOTER_HEIGHT;
    
    // Calculate grid positions
    const positions = calculateGridLayout(sizes, availableWidth, availableHeight);
    
    // Draw header
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#000')
      .text('TripDAR Seal Calibration', MARGIN, MARGIN);
    
    doc.fontSize(10).font('Helvetica').fillColor('#666')
      .text(`Preset: ${config.basePreset} | QR Scale: ${((config.qrScale ?? 1) * 100).toFixed(0)}% | Spore Count: ${config.sporeCount.toLocaleString()}`, MARGIN, MARGIN + 22);
    
    doc.fontSize(8).fillColor('#999')
      .text(`Generated: ${new Date().toISOString()} | Token: TUNER_PREVIEW_001 (test only)`, MARGIN, MARGIN + 38);
    
    // Draw seals
    const contentStartY = MARGIN + HEADER_HEIGHT;
    
    for (let i = 0; i < sizes.length; i++) {
      const pos = positions[i];
      const sizeInches = sizes[i];
      
      const sealX = MARGIN + pos.x;
      const sealY = contentStartY + pos.y;
      
      // Draw the seal SVG
      try {
        SVGtoPDF(doc, svg, sealX, sealY, {
          width: pos.sizePoints,
          height: pos.sizePoints,
          preserveAspectRatio: 'xMidYMid meet',
        });
      } catch (svgError) {
        console.error('SVG rendering error:', svgError);
        // Draw placeholder circle
        doc.circle(sealX + pos.sizePoints / 2, sealY + pos.sizePoints / 2, pos.sizePoints / 2 - 2)
          .strokeColor('#f00')
          .lineWidth(1)
          .stroke();
      }
      
      // Draw size label below seal
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333')
        .text(`${sizeInches}"`, sealX, sealY + pos.sizePoints + 4, {
          width: pos.sizePoints,
          align: 'center',
        });
    }
    
    // Draw footer with configuration summary
    const footerY = paper.height - MARGIN - FOOTER_HEIGHT;
    
    doc.moveTo(MARGIN, footerY).lineTo(paper.width - MARGIN, footerY)
      .strokeColor('#ddd').lineWidth(0.5).stroke();
    
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#333')
      .text('Configuration', MARGIN, footerY + 8);
    
    // Format config as readable text
    const configLines = [
      `Base Preset: ${config.basePreset}`,
      `QR Scale: ${((config.qrScale ?? 1) * 100).toFixed(0)}%`,
      `QR Rotation: ${config.qrRotation ?? 0}°`,
      `Spore Count: ${config.sporeCount.toLocaleString()}`,
      `Zone A End: ${((config.zoneAEnd ?? 0.4) * 100).toFixed(0)}%`,
      `Zone B End: ${((config.zoneBEnd ?? 0.7) * 100).toFixed(0)}%`,
      config.quietCoreFactor ? `Quiet Core: ${((config.quietCoreFactor) * 100).toFixed(0)}%` : null,
      config.finderExclusionMultiplier ? `Finder Exclusion: ${config.finderExclusionMultiplier.toFixed(2)}×` : null,
    ].filter(Boolean);
    
    doc.fontSize(7).font('Helvetica').fillColor('#666')
      .text(configLines.join('  |  '), MARGIN, footerY + 22, {
        width: paper.width - 2 * MARGIN,
      });
    
    doc.fontSize(7).fillColor('#999')
      .text(`Sizes: ${sizes.map(s => `${s}"`).join(', ')} | Paper: ${paperSize.toUpperCase()} | Single-page calibration mode`, 
        MARGIN, footerY + 38, {
        width: paper.width - 2 * MARGIN,
      });
    
    doc.end();
    
    const pdfBuffer = await pdfComplete;
    
    // Return PDF - convert Buffer to Uint8Array for NextResponse compatibility
    return new NextResponse(new Uint8Array(pdfBuffer), {
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

/**
 * Sheet PDF Service
 * 
 * Generates print-ready PDFs from sheet SVGs.
 * Uses resvg for SVG → PNG conversion and pdfkit for PDF generation.
 */

import { Resvg } from '@resvg/resvg-js';
import PDFDocument from 'pdfkit';
import { 
  renderLabelPreviewWithMeta, 
  composeLetterSheetsFromLabelSvgs,
  computeLetterSheetLayout
} from './labelService';
import { PlaceableElement } from '../types/placement';
import { 
  SHEET_WIDTH_IN, 
  SHEET_HEIGHT_IN, 
  SHEET_MARGIN_IN,
  SheetDecorations,
  DEFAULT_SHEET_DECORATIONS,
} from '../constants/sheet';

// Alias for clarity
const LETTER_WIDTH_IN = SHEET_WIDTH_IN;
const LETTER_HEIGHT_IN = SHEET_HEIGHT_IN;
const LETTER_MARGIN_IN = SHEET_MARGIN_IN;

// PDF generation constants
const DPI = 300;
const PAGE_WIDTH_PX = LETTER_WIDTH_IN * DPI;  // 8.5 * 300 = 2550
const PAGE_HEIGHT_PX = LETTER_HEIGHT_IN * DPI; // 11 * 300 = 3300

// PDF page size in points (72 points per inch)
const POINTS_PER_INCH = 72;
const PAGE_WIDTH_PT = LETTER_WIDTH_IN * POINTS_PER_INCH;  // 612
const PAGE_HEIGHT_PT = LETTER_HEIGHT_IN * POINTS_PER_INCH; // 792

// Maximum labels to prevent abuse
const MAX_LABELS = 2000;

export interface SheetPdfParams {
  versionId: string;
  quantity: number;
  elements?: PlaceableElement[];
  labelWidthIn?: number;
  labelHeightIn?: number;
  decorations?: SheetDecorations;
  // Optional entity info for barcode rendering (product.barcodeValue ?? product.sku)
  entityType?: 'PRODUCT' | 'BATCH' | 'INVENTORY' | 'CUSTOM';
  entityId?: string;
}

export interface SheetPdfResult {
  buffer: Buffer;
  pageCount: number;
  labelsPerSheet: number;
  totalLabels: number;
}

/**
 * Renders a sheet SVG to PNG at 300 DPI
 */
function renderSvgToPng(svgString: string): Buffer {
  const resvg = new Resvg(svgString, {
    fitTo: {
      mode: 'width',
      value: PAGE_WIDTH_PX,
    },
    font: {
      // Use system fonts with fallbacks
      fontFiles: [],
      loadSystemFonts: true,
      defaultFontFamily: 'Arial, Helvetica, sans-serif',
    },
    // Ensure high quality rendering
    shapeRendering: 2, // geometricPrecision
    textRendering: 1, // optimizeLegibility
    imageRendering: 0, // optimizeQuality
  });
  
  const pngData = resvg.render();
  return pngData.asPng();
}

/**
 * Creates a PDF document with the given PNG pages
 */
function createPdfFromPngs(pngBuffers: Buffer[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 0, // We handle margins in the SVG
      autoFirstPage: false,
    });
    
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    for (const pngBuffer of pngBuffers) {
      doc.addPage({
        size: 'LETTER',
        margin: 0,
      });
      
      // Embed the PNG at full page size
      // The PNG is already rendered at the correct size with margins baked in
      doc.image(pngBuffer, 0, 0, {
        width: PAGE_WIDTH_PT,
        height: PAGE_HEIGHT_PT,
      });
    }
    
    doc.end();
  });
}

/**
 * Generates a print-ready PDF buffer from sheet parameters.
 * 
 * This function:
 * 1. Renders the label SVG with elements
 * 2. Computes sheet layout (labels per sheet, rotation, etc.)
 * 3. Generates sheet SVGs for each page
 * 4. Converts each sheet SVG to PNG at 300 DPI
 * 5. Combines PNGs into a multi-page PDF
 */
export async function renderSheetPdfBuffer(params: SheetPdfParams): Promise<SheetPdfResult> {
  const { 
    versionId, 
    quantity, 
    elements, 
    labelWidthIn, 
    labelHeightIn,
    decorations = DEFAULT_SHEET_DECORATIONS,
    entityType,
    entityId,
  } = params;
  
  // Validate and clamp quantity
  const clampedQuantity = Math.max(1, Math.min(MAX_LABELS, Math.floor(quantity)));
  
  if (quantity > MAX_LABELS) {
    throw new Error(`Quantity exceeds maximum of ${MAX_LABELS} labels`);
  }
  
  // Build entity info for barcode rendering - REQUIRED for PDF generation
  if (!entityType || !entityId) {
    throw new Error('entityType and entityId are required for PDF generation');
  }
  const entityInfo = { entityType: entityType as 'PRODUCT' | 'BATCH' | 'INVENTORY' | 'CUSTOM', entityId };
  
  // Step 1: Render a single label to get the SVG template
  // Pass entity info for barcode rendering (product.barcodeValue ?? product.sku)
  const labelResult = await renderLabelPreviewWithMeta(versionId, {
    elements,
    labelWidthIn,
    labelHeightIn,
  }, entityInfo);
  
  // Step 2: Compute layout to determine labels per sheet
  const effectiveWidthIn = labelWidthIn ?? labelResult.meta.widthIn;
  const effectiveHeightIn = labelHeightIn ?? labelResult.meta.heightIn;
  
  const layout = computeLetterSheetLayout(
    effectiveWidthIn,
    effectiveHeightIn,
    'portrait',
    LETTER_MARGIN_IN
  );
  
  if (layout.perSheet === 0) {
    throw new Error('Label is too large to fit on a letter-size sheet');
  }
  
  // Step 3: Calculate number of pages needed
  const pageCount = Math.ceil(clampedQuantity / layout.perSheet);
  
  // Step 4: Generate sheet SVGs for each page
  // For PDF, we render ALL labels (not placeholders like in preview)
  // Create an array of identical label SVGs for the full quantity
  const labelSvgs: string[] = Array(clampedQuantity).fill(labelResult.svg);
  
  const { sheets } = composeLetterSheetsFromLabelSvgs({
    labelSvgs,
    orientation: 'portrait',
    marginIn: LETTER_MARGIN_IN,
    decorations,
  });
  
  // Step 5: Convert each sheet SVG to PNG
  const pngBuffers: Buffer[] = [];
  for (const sheetSvg of sheets) {
    const pngBuffer = renderSvgToPng(sheetSvg);
    pngBuffers.push(pngBuffer);
  }
  
  // Step 6: Create PDF from PNGs
  const pdfBuffer = await createPdfFromPngs(pngBuffers);
  
  return {
    buffer: pdfBuffer,
    pageCount,
    labelsPerSheet: layout.perSheet,
    totalLabels: clampedQuantity,
  };
}

/**
 * Export computeLetterSheetLayout for use by API route
 */
export { computeLetterSheetLayout };


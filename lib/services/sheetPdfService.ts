/**
 * Sheet PDF Service
 * 
 * Generates print-ready PDFs from sheet SVGs.
 * Uses resvg for SVG → PNG conversion and pdfkit for PDF generation.
 */

import { Resvg } from '@resvg/resvg-js';
import PDFDocument from 'pdfkit';
import { 
  renderLabelsShared,
  getBaseUrl,
  composeLetterSheetsFromLabelSvgs,
  computeLetterSheetLayout,
  getSvgPhysicalSizeInches
} from './labelService';
import { PlaceableElement } from '../types/placement';
import { LabelEntityType } from '@prisma/client';
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

// Preview QR payload - non-routable, clearly marked as preview
const PREVIEW_QR_PAYLOAD = 'PREVIEW-QR-NOT-ACTIVE';

/**
 * PDF generation mode:
 * - 'preview': Design-time preview, uses placeholder QR codes, no entity context required
 * - 'token': Production printing, generates unique QR tokens, entity context REQUIRED
 */
export type PdfRenderMode = 'preview' | 'token';

export interface SheetPdfParams {
  versionId: string;
  quantity: number;
  elements?: PlaceableElement[];
  labelWidthIn?: number;
  labelHeightIn?: number;
  decorations?: SheetDecorations;
  /**
   * PDF render mode - MUST be explicitly set by caller
   * - 'preview': Label setup/editor preview, placeholder QR codes
   * - 'token': Production print, unique QR tokens per label
   */
  mode: PdfRenderMode;
  // Entity info - REQUIRED when mode === 'token', ignored when mode === 'preview'
  entityType?: LabelEntityType;
  entityId?: string;
  // Optional user ID for audit trail (only used in token mode)
  userId?: string;
}

export interface SheetPdfResult {
  buffer: Buffer;
  pageCount: number;
  labelsPerSheet: number;
  totalLabels: number;
}

/**
 * Load bundled fonts for serverless environments (Vercel doesn't have system fonts)
 */
function getBundledFontFiles(): string[] {
  const fontFiles: string[] = [];
  
  // Try to load Roboto fonts from public/fonts
  // In Next.js, process.cwd() points to the project root
  const fontsDir = path.join(process.cwd(), 'public', 'fonts');
  
  try {
    const robotoRegular = path.join(fontsDir, 'Roboto-Regular.ttf');
    const robotoBold = path.join(fontsDir, 'Roboto-Bold.ttf');
    
    if (fs.existsSync(robotoRegular)) {
      fontFiles.push(robotoRegular);
    }
    if (fs.existsSync(robotoBold)) {
      fontFiles.push(robotoBold);
    }
  } catch {
    // Font loading failed, will fall back to resvg defaults
    console.warn('[sheetPdfService] Could not load bundled fonts');
  }
  
  return fontFiles;
}

/**
 * Renders a sheet SVG to PNG at 300 DPI
 */
export function renderSvgToPng(svgString: string): Buffer {
  const fontFiles = getBundledFontFiles();
  
  const resvg = new Resvg(svgString, {
    fitTo: {
      mode: 'width',
      value: PAGE_WIDTH_PX,
    },
    font: {
      // Load bundled fonts for serverless environments
      fontFiles,
      loadSystemFonts: true,
      defaultFontFamily: 'Roboto, Arial, Helvetica, sans-serif',
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
export function createPdfFromPngs(pngBuffers: Buffer[]): Promise<Buffer> {
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
 * Supports two modes:
 * 
 * MODE: 'preview' (Label Setup / Editor)
 * - No entity context required
 * - QR codes are placeholder text (PREVIEW-QR-NOT-ACTIVE)
 * - Visual "PREVIEW" watermark on QR codes
 * - No tokens created in database
 * 
 * MODE: 'token' (Production Print)
 * - Entity context REQUIRED (entityType + entityId)
 * - Each label gets a unique QR token
 * - Tokens are persisted in database
 * - Used for Product/Batch printing
 */
export async function renderSheetPdfBuffer(params: SheetPdfParams): Promise<SheetPdfResult> {
  const { 
    versionId, 
    quantity, 
    labelWidthIn, 
    labelHeightIn,
    decorations = DEFAULT_SHEET_DECORATIONS,
    mode,
    entityType,
    entityId,
    userId,
  } = params;
  
  // Validate and clamp quantity
  const clampedQuantity = Math.max(1, Math.min(MAX_LABELS, Math.floor(quantity)));
  
  if (quantity > MAX_LABELS) {
    throw new Error(`Quantity exceeds maximum of ${MAX_LABELS} labels`);
  }
  
  // Mode-specific validation
  if (mode === 'token') {
    // Token mode REQUIRES entity context for QR token generation
    if (!entityType || !entityId) {
      throw new Error('Entity context (entityType and entityId) is required for production PDF generation. Please access this from a Product or Batch page.');
    }
  }
  // Preview mode does NOT require entity context - that's the whole point
  
  // Get the base URL for QR codes (only used in token mode)
  const baseUrl = getBaseUrl();
  
  // Step 1: Render labels based on mode
  let labelSvgs: string[];
  
  if (mode === 'token') {
    // TOKEN MODE: Generate unique QR tokens for each label
    // This creates one QR token per label in the database
    const renderResult = await renderLabelsShared({
      mode: 'token',
      versionId,
      entityType: entityType!,
      entityId: entityId!,
      quantity: clampedQuantity,
      userId,
      baseUrl,
    });
    labelSvgs = renderResult.svgs;
  } else {
    // PREVIEW MODE: Use placeholder QR codes, no tokens created
    // All labels are identical (same placeholder QR)
    const renderResult = await renderLabelsShared({
      mode: 'preview',
      versionId,
      quantity: clampedQuantity,
      // Use the non-routable preview payload
      previewQrPayload: PREVIEW_QR_PAYLOAD,
    });
    labelSvgs = renderResult.svgs;
  }
  
  // Step 2: Compute layout to determine labels per sheet
  // Get dimensions from first SVG (all have same dimensions)
  const firstSvg = labelSvgs[0];
  const { widthIn: svgWidthIn, heightIn: svgHeightIn } = getSvgPhysicalSizeInches(firstSvg);
  const effectiveWidthIn = labelWidthIn ?? svgWidthIn;
  const effectiveHeightIn = labelHeightIn ?? svgHeightIn;
  
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
  // In token mode: each label is unique (has its own QR token)
  // In preview mode: all labels are identical (same placeholder QR) - can use instancing
  const { sheets } = composeLetterSheetsFromLabelSvgs({
    labelSvgs,
    orientation: 'portrait',
    marginIn: LETTER_MARGIN_IN,
    decorations,
    uniqueLabels: mode === 'token', // Only use unique labels in token mode
    // Pass dimension overrides if provided
    labelWidthInOverride: labelWidthIn,
    labelHeightInOverride: labelHeightIn,
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


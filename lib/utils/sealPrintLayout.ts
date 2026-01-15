/**
 * Seal Print Layout Utilities
 * 
 * Deterministic imposition math for circular seals on print sheets.
 * All calculations in inches. No browser dependencies.
 * 
 * PRODUCTION SYSTEM - This is not for design proofing.
 * These calculations determine actual physical print output.
 * 
 * INVARIANTS:
 * - Same config = same layout (deterministic)
 * - All math in inches
 * - No partial seals
 * - No rotation (seals are circular)
 * - Grid is centered on sheet
 */

// ========================================
// TYPES
// ========================================

export type PaperType = 'LETTER' | 'A4' | 'CUSTOM';

export interface PaperDimensions {
  type: PaperType;
  widthIn: number;
  heightIn: number;
}

export interface PrintLayoutConfig {
  /** Seal diameter in inches (0.75, 1.0, 1.25, 1.5) */
  sealDiameterIn: number;
  /** Edge-to-edge spacing between seals in inches */
  spacingIn: number;
  /** Paper dimensions */
  paper: PaperDimensions;
  /** Page margin in inches (default 0.25) */
  marginIn: number;
}

export interface GridLayout {
  /** Number of columns */
  columns: number;
  /** Number of rows */
  rows: number;
  /** Total seals per sheet */
  sealsPerSheet: number;
  /** Cell size (seal + spacing) in inches */
  cellSizeIn: number;
  /** X offset to center grid on sheet (inches from left edge) */
  gridOffsetXIn: number;
  /** Y offset to center grid on sheet (inches from top edge) */
  gridOffsetYIn: number;
  /** Usable width after margins (inches) */
  usableWidthIn: number;
  /** Usable height after margins (inches) */
  usableHeightIn: number;
}

export interface SealPosition {
  /** Seal index (0-based) */
  index: number;
  /** Row (0-based) */
  row: number;
  /** Column (0-based) */
  col: number;
  /** Center X position in inches from sheet left edge */
  centerXIn: number;
  /** Center Y position in inches from sheet top edge */
  centerYIn: number;
}

// ========================================
// PAPER SIZE CONSTANTS
// ========================================

export const PAPER_SIZES: Record<Exclude<PaperType, 'CUSTOM'>, PaperDimensions> = {
  LETTER: { type: 'LETTER', widthIn: 8.5, heightIn: 11 },
  A4: { type: 'A4', widthIn: 8.27, heightIn: 11.69 }, // 210mm × 297mm
};

// ========================================
// SEAL SIZE PRESETS
// ========================================

/** Supported seal diameters in inches */
export const SEAL_SIZES_IN = [0.75, 1.0, 1.25, 1.5] as const;
export type SealSizeIn = typeof SEAL_SIZES_IN[number];

// ========================================
// SPACING CONSTRAINTS
// ========================================

export const SPACING_MIN_IN = 0.25;
export const SPACING_MAX_IN = 1.0;
export const SPACING_STEP_IN = 0.125;
export const DEFAULT_SPACING_IN = 0.25;

// ========================================
// MARGIN CONSTRAINTS
// ========================================

export const DEFAULT_MARGIN_IN = 0.25;
/** Minimum margin for registration marks (from sheet.ts) */
export const MIN_MARGIN_TOP_BOTTOM_IN = 0.5;

// ========================================
// LAYOUT CALCULATION
// ========================================

/**
 * Calculate grid layout for seals on a sheet.
 * 
 * The grid is centered on the sheet with equal margins on all sides.
 * Top/bottom margins are at least 0.5" to accommodate registration marks.
 */
export function calculateGridLayout(config: PrintLayoutConfig): GridLayout {
  const { sealDiameterIn, spacingIn, paper, marginIn } = config;
  
  // Cell size = seal diameter + spacing
  // (spacing is edge-to-edge, so we add it to the seal diameter)
  const cellSizeIn = sealDiameterIn + spacingIn;
  
  // Use asymmetric margins: left/right use marginIn, top/bottom use at least 0.5"
  const marginLeftIn = marginIn;
  const marginRightIn = marginIn;
  const marginTopIn = Math.max(marginIn, MIN_MARGIN_TOP_BOTTOM_IN);
  const marginBottomIn = Math.max(marginIn, MIN_MARGIN_TOP_BOTTOM_IN);
  
  // Calculate usable area
  const usableWidthIn = paper.widthIn - marginLeftIn - marginRightIn;
  const usableHeightIn = paper.heightIn - marginTopIn - marginBottomIn;
  
  // Calculate how many cells fit
  const columns = Math.floor(usableWidthIn / cellSizeIn);
  const rows = Math.floor(usableHeightIn / cellSizeIn);
  const sealsPerSheet = columns * rows;
  
  // Calculate grid dimensions
  const gridWidthIn = columns * cellSizeIn;
  const gridHeightIn = rows * cellSizeIn;
  
  // Center the grid within usable area
  // Grid offset is from the sheet edge (includes margin)
  const gridOffsetXIn = marginLeftIn + (usableWidthIn - gridWidthIn) / 2;
  const gridOffsetYIn = marginTopIn + (usableHeightIn - gridHeightIn) / 2;
  
  return {
    columns: Math.max(0, columns),
    rows: Math.max(0, rows),
    sealsPerSheet: Math.max(0, sealsPerSheet),
    cellSizeIn,
    gridOffsetXIn,
    gridOffsetYIn,
    usableWidthIn,
    usableHeightIn,
  };
}

/**
 * Calculate positions for all seals in a grid.
 * 
 * Positions are calculated as seal centers (not top-left corners).
 * Order: left-to-right, top-to-bottom (reading order).
 */
export function calculateSealPositions(
  layout: GridLayout,
  config: PrintLayoutConfig,
  count?: number
): SealPosition[] {
  const { sealDiameterIn } = config;
  const { columns, rows, cellSizeIn, gridOffsetXIn, gridOffsetYIn } = layout;
  
  const positions: SealPosition[] = [];
  const maxSeals = count ?? (columns * rows);
  
  let index = 0;
  for (let row = 0; row < rows && index < maxSeals; row++) {
    for (let col = 0; col < columns && index < maxSeals; col++) {
      // Cell top-left corner
      const cellXIn = gridOffsetXIn + col * cellSizeIn;
      const cellYIn = gridOffsetYIn + row * cellSizeIn;
      
      // Seal center (seal is centered in cell, accounting for spacing)
      const centerXIn = cellXIn + sealDiameterIn / 2;
      const centerYIn = cellYIn + sealDiameterIn / 2;
      
      positions.push({
        index,
        row,
        col,
        centerXIn,
        centerYIn,
      });
      
      index++;
    }
  }
  
  return positions;
}

/**
 * Calculate how many sheets are needed for a given number of seals.
 */
export function calculateSheetCount(totalSeals: number, sealsPerSheet: number): number {
  if (sealsPerSheet <= 0) return 0;
  return Math.ceil(totalSeals / sealsPerSheet);
}

/**
 * Validate a print layout configuration.
 * Returns array of error messages (empty if valid).
 */
export function validatePrintLayoutConfig(config: PrintLayoutConfig): string[] {
  const errors: string[] = [];
  
  // Validate seal size
  if (!SEAL_SIZES_IN.includes(config.sealDiameterIn as SealSizeIn)) {
    errors.push(`Invalid seal size: ${config.sealDiameterIn}". Must be one of: ${SEAL_SIZES_IN.join(', ')}`);
  }
  
  // Validate spacing
  if (config.spacingIn < SPACING_MIN_IN) {
    errors.push(`Spacing too small: ${config.spacingIn}". Minimum is ${SPACING_MIN_IN}"`);
  }
  if (config.spacingIn > SPACING_MAX_IN) {
    errors.push(`Spacing too large: ${config.spacingIn}". Maximum is ${SPACING_MAX_IN}"`);
  }
  
  // Validate margin
  if (config.marginIn < 0) {
    errors.push(`Margin cannot be negative: ${config.marginIn}"`);
  }
  if (config.marginIn > 1) {
    errors.push(`Margin too large: ${config.marginIn}". Maximum is 1"`);
  }
  
  // Validate paper dimensions
  if (config.paper.widthIn <= 0 || config.paper.heightIn <= 0) {
    errors.push('Paper dimensions must be positive');
  }
  
  // Validate that at least one seal fits
  const layout = calculateGridLayout(config);
  if (layout.sealsPerSheet === 0) {
    errors.push('No seals fit on sheet with current configuration');
  }
  
  return errors;
}

/**
 * Get paper dimensions for a paper type.
 */
export function getPaperDimensions(
  type: PaperType,
  customWidth?: number,
  customHeight?: number
): PaperDimensions {
  if (type === 'CUSTOM') {
    if (!customWidth || !customHeight) {
      throw new Error('Custom paper size requires width and height');
    }
    return { type: 'CUSTOM', widthIn: customWidth, heightIn: customHeight };
  }
  return PAPER_SIZES[type];
}

/**
 * Format seal size for display.
 */
export function formatSealSize(sizeIn: number): string {
  if (sizeIn === 1) return '1"';
  return `${sizeIn}"`;
}

/**
 * Format spacing for display.
 */
export function formatSpacing(spacingIn: number): string {
  return `${spacingIn}"`;
}


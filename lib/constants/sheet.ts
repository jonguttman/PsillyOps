/**
 * Sheet Layout Constants
 * 
 * SINGLE SOURCE OF TRUTH for print sheet dimensions.
 * All sheet composition and preview logic must use these values.
 * 
 * Standard: US Letter (8.5 × 11 in) with configurable margins.
 */

// ========================================
// SHEET DIMENSIONS (US Letter)
// ========================================

export const SHEET_WIDTH_IN = 8.5;
export const SHEET_HEIGHT_IN = 11;

// ========================================
// ORIENTATION
// ========================================

export type SheetOrientation = 'portrait' | 'landscape';

export const ORIENTATIONS: Record<SheetOrientation, { widthIn: number; heightIn: number; label: string }> = {
  portrait: { widthIn: 8.5, heightIn: 11, label: 'Portrait (8.5 × 11)' },
  landscape: { widthIn: 11, heightIn: 8.5, label: 'Landscape (11 × 8.5)' },
};

// ========================================
// MARGIN PRESETS
// ========================================

export type MarginPreset = 'standard' | 'narrow' | 'custom';

export const MARGIN_PRESETS: Record<Exclude<MarginPreset, 'custom'>, { value: number; label: string }> = {
  standard: { value: 0.25, label: '0.25 in (Standard)' },
  narrow: { value: 0.125, label: '0.125 in (Narrow)' },
};

export const DEFAULT_MARGIN_IN = 0.25;

// ========================================
// ASYMMETRIC MARGINS (for registration marks)
// ========================================
// Top/bottom margins are larger to prevent registration mark clipping
// Left/right margins stay narrow to maximize printable width

export const MARGIN_LEFT_IN = 0.25;   // Keep narrow for max width
export const MARGIN_RIGHT_IN = 0.25;  // Keep narrow for max width
export const MARGIN_TOP_IN = 0.5;     // Increased for registration marks
export const MARGIN_BOTTOM_IN = 0.5;  // Increased for registration marks

// ========================================
// LEGACY CONSTANTS (for backward compatibility)
// ========================================

export const SHEET_MARGIN_IN = DEFAULT_MARGIN_IN;
export const SHEET_USABLE_WIDTH_IN = SHEET_WIDTH_IN - MARGIN_LEFT_IN - MARGIN_RIGHT_IN;   // 8.0
export const SHEET_USABLE_HEIGHT_IN = SHEET_HEIGHT_IN - MARGIN_TOP_IN - MARGIN_BOTTOM_IN; // 10.0

// ========================================
// SHEET INFO (for display)
// ========================================

export const SHEET_INFO = {
  name: 'US Letter',
  widthIn: SHEET_WIDTH_IN,
  heightIn: SHEET_HEIGHT_IN,
  marginIn: SHEET_MARGIN_IN,
  usableWidthIn: SHEET_USABLE_WIDTH_IN,
  usableHeightIn: SHEET_USABLE_HEIGHT_IN,
} as const;

// ========================================
// SHEET SETTINGS TYPE
// ========================================

export interface SheetSettings {
  orientation: SheetOrientation;
  marginIn: number;
  marginPreset: MarginPreset;
  labelWidthIn: number;
  labelHeightIn: number;
}

export const DEFAULT_SHEET_SETTINGS: Omit<SheetSettings, 'labelWidthIn' | 'labelHeightIn'> = {
  orientation: 'portrait',
  marginIn: DEFAULT_MARGIN_IN,
  marginPreset: 'standard',
};

// ========================================
// SHEET DECORATIONS (Optional Print Helpers)
// ========================================

/**
 * Sheet decorations are optional print helpers that appear outside
 * the label grid. They do not affect label placement or count.
 */
export interface SheetDecorations {
  /** Show metadata footer below label grid */
  showFooter: boolean;
  /** Product name for footer (e.g., "Mighty Caps") */
  productName?: string;
  /** Version identifier for footer (e.g., "v0.004") */
  versionLabel?: string;
  /** Custom notes for footer (e.g., "Retail run") */
  footerNotes?: string;
  /** Show corner registration marks for laser alignment */
  showRegistrationMarks: boolean;
  /** Show center crosshair for alignment reference */
  showCenterCrosshair: boolean;
}

export const DEFAULT_SHEET_DECORATIONS: SheetDecorations = {
  showFooter: false,
  productName: undefined,
  versionLabel: undefined,
  footerNotes: undefined,
  showRegistrationMarks: false,
  showCenterCrosshair: false,
};

// Registration mark dimensions (in inches)
export const REGISTRATION_MARK_LENGTH_IN = 0.25;
export const REGISTRATION_MARK_STROKE_WIDTH_IN = 0.01; // Thin but visible for laser
export const REGISTRATION_MARK_COLOR = 'rgba(0, 0, 0, 0.6)'; // 60% gray - visible but not dominant

// Footer styling
export const FOOTER_FONT_SIZE_IN = 0.08;
export const FOOTER_COLOR = 'rgba(0, 0, 0, 0.5)';
export const FOOTER_FONT_FAMILY = 'Arial, Helvetica, sans-serif'; // Use common fonts for PDF compatibility

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Get sheet dimensions for a given orientation
 */
export function getSheetDimensions(orientation: SheetOrientation): { widthIn: number; heightIn: number } {
  return ORIENTATIONS[orientation];
}

/**
 * Calculate printable area for given sheet settings
 */
export function getPrintableArea(orientation: SheetOrientation, marginIn: number): {
  widthIn: number;
  heightIn: number;
} {
  const sheet = getSheetDimensions(orientation);
  return {
    widthIn: sheet.widthIn - 2 * marginIn,
    heightIn: sheet.heightIn - 2 * marginIn,
  };
}

/**
 * Calculate grid layout for labels on a sheet
 */
export function calculateGridLayout(
  orientation: SheetOrientation,
  marginIn: number,
  labelWidthIn: number,
  labelHeightIn: number
): {
  columns: number;
  rows: number;
  perSheet: number;
  rotated: boolean;
} {
  const printable = getPrintableArea(orientation, marginIn);
  
  // Try normal orientation
  const cols0 = Math.floor(printable.widthIn / labelWidthIn);
  const rows0 = Math.floor(printable.heightIn / labelHeightIn);
  const cap0 = cols0 * rows0;
  
  // Try rotated 90°
  const cols90 = Math.floor(printable.widthIn / labelHeightIn);
  const rows90 = Math.floor(printable.heightIn / labelWidthIn);
  const cap90 = cols90 * rows90;
  
  // Use whichever fits more labels
  if (cap90 > cap0 && cap90 > 0) {
    return {
      columns: cols90,
      rows: rows90,
      perSheet: cap90,
      rotated: true,
    };
  }
  
  return {
    columns: Math.max(1, cols0),
    rows: Math.max(1, rows0),
    perSheet: Math.max(1, cap0),
    rotated: false,
  };
}


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
// LEGACY CONSTANTS (for backward compatibility)
// ========================================

export const SHEET_MARGIN_IN = DEFAULT_MARGIN_IN;
export const SHEET_USABLE_WIDTH_IN = SHEET_WIDTH_IN - 2 * SHEET_MARGIN_IN;   // 8.0
export const SHEET_USABLE_HEIGHT_IN = SHEET_HEIGHT_IN - 2 * SHEET_MARGIN_IN; // 10.5

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


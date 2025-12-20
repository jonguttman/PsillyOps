/**
 * Sheet Print Validation Utilities
 * 
 * Phase 6.2: Guardrails & Validation
 * 
 * This module provides validation for print sheet configurations.
 * It does NOT perform rendering - only validates inputs.
 */

// Constants
export const LETTER_WIDTH_IN = 8.5;
export const LETTER_HEIGHT_IN = 11;
export const MIN_MARGIN_IN = 0.25;
export const MAX_MARGIN_IN = 2;
export const MIN_LABEL_SIZE_IN = 0.1;
export const MAX_LABEL_WIDTH_IN = 8.5;
export const MAX_LABEL_HEIGHT_IN = 11;
export const MAX_LABELS_PER_JOB = 1000;
export const DEFAULT_MARGIN_TOP_BOTTOM_IN = 0.5;

// Warning thresholds
export const SMALL_LABEL_THRESHOLD_IN = 0.5;
export const HIGH_LABEL_COUNT_THRESHOLD = 30;
export const EXTREME_ASPECT_RATIO = 4;

export interface SheetLayoutResult {
  columns: number;
  rows: number;
  perSheet: number;
  rotationUsed: boolean;
  marginLeftIn: number;
  marginRightIn: number;
  marginTopIn: number;
  marginBottomIn: number;
  usableWidthIn: number;
  usableHeightIn: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export interface SheetValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  layout: SheetLayoutResult | null;
  sheetsRequired: number;
  clampedQuantity: number;
}

/**
 * Calculate sheet layout from label dimensions and margins.
 * This mirrors the logic in labelService.computeLetterSheetLayout
 * but is designed for validation (no SVG operations).
 */
export function calculateSheetLayout(
  labelWidthIn: number,
  labelHeightIn: number,
  marginTopBottomIn: number = DEFAULT_MARGIN_TOP_BOTTOM_IN,
  marginLeftRightIn: number = MIN_MARGIN_IN
): SheetLayoutResult {
  // Use fixed margins for left/right (same as top/bottom for simplicity in validation)
  const marginLeftIn = marginLeftRightIn;
  const marginRightIn = marginLeftRightIn;
  const marginTopIn = Math.max(marginTopBottomIn, DEFAULT_MARGIN_TOP_BOTTOM_IN);
  const marginBottomIn = Math.max(marginTopBottomIn, DEFAULT_MARGIN_TOP_BOTTOM_IN);
  
  const usableWidthIn = LETTER_WIDTH_IN - marginLeftIn - marginRightIn;
  const usableHeightIn = LETTER_HEIGHT_IN - marginTopIn - marginBottomIn;
  
  // Calculate fit without rotation
  const cols0 = Math.floor(usableWidthIn / labelWidthIn);
  const rows0 = Math.floor(usableHeightIn / labelHeightIn);
  const cap0 = cols0 * rows0;
  
  // Calculate fit with 90° rotation
  const cols90 = Math.floor(usableWidthIn / labelHeightIn);
  const rows90 = Math.floor(usableHeightIn / labelWidthIn);
  const cap90 = cols90 * rows90;
  
  // Choose the better fit
  if (cap90 > cap0) {
    return {
      columns: cols90,
      rows: rows90,
      perSheet: cap90,
      rotationUsed: true,
      marginLeftIn,
      marginRightIn,
      marginTopIn,
      marginBottomIn,
      usableWidthIn,
      usableHeightIn,
    };
  }
  
  return {
    columns: cols0,
    rows: rows0,
    perSheet: cap0,
    rotationUsed: false,
    marginLeftIn,
    marginRightIn,
    marginTopIn,
    marginBottomIn,
    usableWidthIn,
    usableHeightIn,
  };
}

/**
 * Validate print sheet configuration.
 * Returns errors (blocking) and warnings (informational).
 */
export function validateSheetConfig(params: {
  labelWidthIn: number;
  labelHeightIn: number;
  marginTopBottomIn: number;
  quantity: number;
}): SheetValidationResult {
  const { labelWidthIn, labelHeightIn, marginTopBottomIn, quantity } = params;
  
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // === HARD VALIDATION (Blocking) ===
  
  // Label dimension validation - check if label can fit in EITHER orientation
  // A label can be rotated 90°, so we check both orientations
  const minDimension = Math.min(labelWidthIn, labelHeightIn);
  const maxDimension = Math.max(labelWidthIn, labelHeightIn);
  
  // Label width validation (basic)
  if (labelWidthIn <= 0) {
    errors.push({ field: 'labelWidthIn', message: 'Label width must be greater than 0' });
  }
  
  // Label height validation (basic)
  if (labelHeightIn <= 0) {
    errors.push({ field: 'labelHeightIn', message: 'Label height must be greater than 0' });
  }
  
  // Check if label can fit on sheet in ANY orientation
  // The smaller dimension must fit within usable width (8.5" - margins)
  // The larger dimension must fit within usable height (11" - margins)
  if (labelWidthIn > 0 && labelHeightIn > 0) {
    const usableWidth = LETTER_WIDTH_IN - (2 * MIN_MARGIN_IN); // ~8" with min margins
    const usableHeight = LETTER_HEIGHT_IN - (2 * DEFAULT_MARGIN_TOP_BOTTOM_IN); // ~10" with default margins
    
    // Check if it fits in normal orientation OR rotated
    const fitsNormal = labelWidthIn <= usableWidth && labelHeightIn <= usableHeight;
    const fitsRotated = labelHeightIn <= usableWidth && labelWidthIn <= usableHeight;
    
    if (!fitsNormal && !fitsRotated) {
      // Label doesn't fit in either orientation - provide specific error
      if (maxDimension > MAX_LABEL_HEIGHT_IN) {
        errors.push({ field: 'labelSize', message: `Label dimension ${maxDimension}" exceeds maximum sheet dimension of ${MAX_LABEL_HEIGHT_IN}"` });
      } else if (minDimension > usableWidth) {
        errors.push({ field: 'labelSize', message: `Label is too large to fit on sheet even when rotated` });
      }
    }
  }
  
  // Margin validation
  if (marginTopBottomIn < MIN_MARGIN_IN) {
    errors.push({ field: 'marginTopBottomIn', message: `Margin must be at least ${MIN_MARGIN_IN} inches` });
  } else if (marginTopBottomIn > MAX_MARGIN_IN) {
    errors.push({ field: 'marginTopBottomIn', message: `Margin cannot exceed ${MAX_MARGIN_IN} inches` });
  }
  
  // Quantity validation
  if (quantity <= 0) {
    errors.push({ field: 'quantity', message: 'Quantity must be at least 1' });
  }
  
  // If basic validation fails, return early
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
      layout: null,
      sheetsRequired: 0,
      clampedQuantity: Math.min(Math.max(quantity, 1), MAX_LABELS_PER_JOB),
    };
  }
  
  // Calculate layout
  const layout = calculateSheetLayout(labelWidthIn, labelHeightIn, marginTopBottomIn);
  
  // Sheet fit validation
  if (layout.perSheet === 0) {
    errors.push({ 
      field: 'labelSize', 
      message: 'Label is too large to fit on a letter-size sheet with current margins' 
    });
    return {
      valid: false,
      errors,
      warnings,
      layout,
      sheetsRequired: 0,
      clampedQuantity: Math.min(Math.max(quantity, 1), MAX_LABELS_PER_JOB),
    };
  }
  
  // Clamp quantity to max
  const clampedQuantity = Math.min(quantity, MAX_LABELS_PER_JOB);
  if (quantity > MAX_LABELS_PER_JOB) {
    warnings.push({
      field: 'quantity',
      message: `Maximum of ${MAX_LABELS_PER_JOB} labels per print job`
    });
  }
  
  const sheetsRequired = Math.ceil(clampedQuantity / layout.perSheet);
  
  // === WARNINGS (Non-blocking) ===
  
  // Small label warning
  if (labelWidthIn < SMALL_LABEL_THRESHOLD_IN || labelHeightIn < SMALL_LABEL_THRESHOLD_IN) {
    warnings.push({
      field: 'labelSize',
      message: 'Very small labels may be difficult to handle'
    });
  }
  
  // High label count warning
  if (layout.perSheet > HIGH_LABEL_COUNT_THRESHOLD) {
    warnings.push({
      field: 'labelCount',
      message: `${layout.perSheet} labels per sheet may affect rendering performance`
    });
  }
  
  // Extreme aspect ratio warning
  const aspectRatio = Math.max(labelWidthIn / labelHeightIn, labelHeightIn / labelWidthIn);
  if (aspectRatio > EXTREME_ASPECT_RATIO) {
    warnings.push({
      field: 'aspectRatio',
      message: 'Extreme aspect ratio may cause layout issues'
    });
  }
  
  return {
    valid: true,
    errors,
    warnings,
    layout,
    sheetsRequired,
    clampedQuantity,
  };
}

/**
 * Format validation result for API error response
 */
export function formatValidationError(result: SheetValidationResult): string {
  if (result.valid) return '';
  return result.errors.map(e => e.message).join('; ');
}


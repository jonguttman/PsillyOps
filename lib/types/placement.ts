/**
 * Unified Placement Types
 * 
 * Core types for the unified QR + barcode placement system.
 * All measurements are in physical inches.
 * 
 * DESIGN LAWS:
 * - Geometry is geometry (xIn, yIn, widthIn, heightIn)
 * - Semantics are semantics (barcode options)
 * - Rotation is visual only (does not affect placement values)
 * - Movement is always label-relative (up = up, regardless of rotation)
 */

/**
 * Allowed rotation values for persistence.
 * 
 * Phase 3: Free rotation is allowed during editing, but on save
 * the value snaps to one of these allowed values.
 * 
 * Rotation is VISUAL ONLY - it does not change placement coordinates.
 */
export type Rotation = 0 | 90 | -90 | 180;

/**
 * Physical placement of an element on a label.
 * All values are in inches from the label's top-left corner.
 * 
 * - xIn: distance from left edge
 * - yIn: distance from top edge
 * - widthIn: element width (unrotated)
 * - heightIn: element height (unrotated)
 * - rotation: visual rotation applied at render time
 */
export interface Placement {
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
  rotation: Rotation;
}

/**
 * Barcode-specific rendering options.
 * These are semantic properties that affect how the barcode looks,
 * but do NOT affect the bounding box geometry.
 * 
 * - format: barcode symbology (EAN_13)
 * - barHeightIn: height of the black bars only
 * - textSizeIn: font size for human-readable text
 * - textGapIn: gap between bars and text
 * - backgroundColor: background color behind bars only (not text)
 */
export interface BarcodeOptions {
  format: 'EAN_13';
  barHeightIn: number;
  textSizeIn: number;
  textGapIn: number;
  backgroundColor: string;
}

/**
 * Element type discriminator.
 */
export type ElementType = 'QR' | 'BARCODE';

/**
 * Background style for placeable elements.
 * - 'white': renders a white background rect behind the element
 * - 'transparent': no background rect (element floats on label)
 */
export type BackgroundStyle = 'white' | 'transparent';

/**
 * A placeable element on a label.
 * 
 * QR elements:
 * - Must be square (widthIn === heightIn)
 * - barcode field is ignored
 * - useFrame: if true, wraps QR in "Authenticity Check" frame
 * 
 * BARCODE elements:
 * - heightIn is the bounding box (includes bars + gap + text)
 * - barcode field contains rendering options
 * - Actual bar height is barcode.barHeightIn
 */
export interface PlaceableElement {
  id: string;
  type: ElementType;
  placement: Placement;
  background?: BackgroundStyle; // Default: 'white'
  barcode?: BarcodeOptions;
  useFrame?: boolean; // QR only: wrap in "Authenticity Check" frame
}

/**
 * Validate that a rotation value is allowed.
 */
export function isValidRotation(value: number): value is Rotation {
  return value === 0 || value === 90 || value === -90 || value === 180;
}

/**
 * Snap a free rotation angle to the nearest allowed rotation value.
 * Used when committing rotation from handle-based free rotation.
 */
export function snapToAllowedRotation(angle: number): Rotation {
  // Normalize to -180 to 180 range
  let r = angle % 360;
  if (r > 180) r -= 360;
  if (r < -180) r += 360;
  
  // Find nearest snap point
  if (r >= -45 && r < 45) return 0;
  if (r >= 45 && r < 135) return 90;
  if (r >= -135 && r < -45) return -90;
  return 180;
}

/**
 * Validate a PlaceableElement.
 * Returns an error message if invalid, null if valid.
 */
export function validateElement(
  element: PlaceableElement,
  labelWidthIn: number,
  labelHeightIn: number
): string | null {
  const { placement, type, barcode } = element;

  // Check rotation
  if (!isValidRotation(placement.rotation)) {
    return `Invalid rotation: ${placement.rotation}. Must be 0, 90, or -90.`;
  }

  // Check size bounds (must have positive dimensions)
  if (placement.widthIn <= 0) {
    return `widthIn must be > 0, got ${placement.widthIn}`;
  }
  if (placement.heightIn <= 0) {
    return `heightIn must be > 0, got ${placement.heightIn}`;
  }

  // NOTE: We intentionally do NOT validate that elements fit within label bounds.
  // Users should be free to place elements anywhere, including partially off the label.
  // The renderer will clip or handle overflow as appropriate.

  // QR must be square
  if (type === 'QR' && Math.abs(placement.widthIn - placement.heightIn) > 0.001) {
    return `QR elements must be square: widthIn=${placement.widthIn}, heightIn=${placement.heightIn}`;
  }

  // Barcode must have options
  if (type === 'BARCODE') {
    if (!barcode) {
      return 'BARCODE elements must have barcode options';
    }
    // Accept both EAN_13 and legacy UPC_A (will be migrated on load)
    if (barcode.format !== 'EAN_13' && barcode.format !== 'UPC_A') {
      return `Invalid barcode format: ${barcode.format}. Only EAN_13 is supported.`;
    }
    if (barcode.barHeightIn <= 0) {
      return `barHeightIn must be > 0, got ${barcode.barHeightIn}`;
    }
    if (barcode.textSizeIn <= 0) {
      return `textSizeIn must be > 0, got ${barcode.textSizeIn}`;
    }
    if (barcode.textGapIn < 0) {
      return `textGapIn must be >= 0, got ${barcode.textGapIn}`;
    }
  }

  return null;
}

/**
 * Validate an array of PlaceableElements.
 * Returns an array of error messages (empty if all valid).
 */
export function validateElements(
  elements: PlaceableElement[],
  labelWidthIn: number,
  labelHeightIn: number
): string[] {
  const errors: string[] = [];

  for (let i = 0; i < elements.length; i++) {
    const error = validateElement(elements[i], labelWidthIn, labelHeightIn);
    if (error) {
      errors.push(`Element ${i} (${elements[i].id}): ${error}`);
    }
  }

  return errors;
}

/**
 * Create a default QR element at the specified position.
 */
export function createDefaultQrElement(
  xIn: number,
  yIn: number,
  sizeIn: number
): PlaceableElement {
  return {
    id: `qr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type: 'QR',
    placement: {
      xIn,
      yIn,
      widthIn: sizeIn,
      heightIn: sizeIn,
      rotation: 0,
    },
  };
}

/**
 * Default barcode dimensions and options.
 * 
 * Scaling rules:
 * - Width scaling scales entire barcode proportionally
 * - Digit size scales with barcode WIDTH
 * - Gap between bars and digits is fixed ratio, scales with width
 * - Bar height can be adjusted independently
 * 
 * EAN-13 format: 13 digits displayed as: X XXXXXX XXXXXX X
 * (first digit outside left, 6 digits left group, 6 digits right group, check digit)
 */
export const DEFAULT_BARCODE_OPTIONS: BarcodeOptions = {
  format: 'EAN_13',
  barHeightIn: 0.5,      // Height of black bars only
  textSizeIn: 0.08,      // Font size for digits (scales with width)
  textGapIn: 0.03,       // Gap between bars and text (scales with width)
  backgroundColor: '#FFFFFF',
};

/**
 * Create a default BARCODE element at the specified position.
 * Uses EAN-13 format.
 */
export function createDefaultBarcodeElement(
  xIn: number,
  yIn: number,
  widthIn: number = 1.0,
  barHeightIn: number = 0.5
): PlaceableElement {
  // Total height = bar height + gap + text height
  // Text size and gap scale with width
  const textSizeIn = widthIn * 0.08;  // 8% of width
  const textGapIn = widthIn * 0.03;   // 3% of width
  const heightIn = barHeightIn + textGapIn + textSizeIn;
  
  return {
    id: `barcode_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type: 'BARCODE',
    placement: {
      xIn,
      yIn,
      widthIn,
      heightIn,
      rotation: 0,
    },
    barcode: {
      format: 'EAN_13',
      barHeightIn,
      textSizeIn,
      textGapIn,
      backgroundColor: '#FFFFFF',
    },
  };
}

/**
 * Calculate barcode total height from width and bar height.
 * Text size and gap scale proportionally with width.
 */
export function calculateBarcodeHeight(widthIn: number, barHeightIn: number): number {
  const textSizeIn = widthIn * 0.08;  // 8% of width
  const textGapIn = widthIn * 0.03;   // 3% of width
  return barHeightIn + textGapIn + textSizeIn;
}

/**
 * Update barcode options when width changes.
 * Maintains proportional text size and gap.
 */
export function updateBarcodeForWidth(
  element: PlaceableElement,
  newWidthIn: number
): Partial<PlaceableElement> {
  if (element.type !== 'BARCODE' || !element.barcode) {
    return {};
  }
  
  const newTextSizeIn = newWidthIn * 0.08;
  const newTextGapIn = newWidthIn * 0.03;
  const newHeightIn = element.barcode.barHeightIn + newTextGapIn + newTextSizeIn;
  
  return {
    placement: {
      ...element.placement,
      widthIn: newWidthIn,
      heightIn: newHeightIn,
    },
    barcode: {
      ...element.barcode,
      textSizeIn: newTextSizeIn,
      textGapIn: newTextGapIn,
    },
  };
}


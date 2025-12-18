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
 * Allowed rotation values.
 * Rotation is VISUAL ONLY - it does not change placement coordinates.
 */
export type Rotation = 0 | 90 | -90;

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
 * - format: barcode symbology (UPC_A for now)
 * - barHeightIn: height of the black bars only
 * - textSizeIn: font size for human-readable text
 * - textGapIn: gap between bars and text
 * - backgroundColor: background color behind bars only (not text)
 */
export interface BarcodeOptions {
  format: 'UPC_A';
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
 * A placeable element on a label.
 * 
 * QR elements:
 * - Must be square (widthIn === heightIn)
 * - barcode field is ignored
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
  barcode?: BarcodeOptions;
}

/**
 * Validate that a rotation value is allowed.
 */
export function isValidRotation(value: number): value is Rotation {
  return value === 0 || value === 90 || value === -90;
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

  // Check bounds
  if (placement.xIn < 0) {
    return `xIn must be >= 0, got ${placement.xIn}`;
  }
  if (placement.yIn < 0) {
    return `yIn must be >= 0, got ${placement.yIn}`;
  }
  if (placement.widthIn <= 0) {
    return `widthIn must be > 0, got ${placement.widthIn}`;
  }
  if (placement.heightIn <= 0) {
    return `heightIn must be > 0, got ${placement.heightIn}`;
  }

  // Check element fits within label
  if (placement.xIn + placement.widthIn > labelWidthIn) {
    return `Element extends beyond label right edge: ${placement.xIn} + ${placement.widthIn} > ${labelWidthIn}`;
  }
  if (placement.yIn + placement.heightIn > labelHeightIn) {
    return `Element extends beyond label bottom edge: ${placement.yIn} + ${placement.heightIn} > ${labelHeightIn}`;
  }

  // QR must be square
  if (type === 'QR' && Math.abs(placement.widthIn - placement.heightIn) > 0.001) {
    return `QR elements must be square: widthIn=${placement.widthIn}, heightIn=${placement.heightIn}`;
  }

  // Barcode must have options
  if (type === 'BARCODE') {
    if (!barcode) {
      return 'BARCODE elements must have barcode options';
    }
    if (barcode.format !== 'UPC_A') {
      return `Invalid barcode format: ${barcode.format}. Only UPC_A is supported.`;
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


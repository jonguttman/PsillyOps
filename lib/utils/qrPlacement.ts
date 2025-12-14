/**
 * QR Placement Utilities (Client-Safe)
 * 
 * Pure functions for QR positioning calculations.
 * Can be safely imported in both client and server components.
 */

export interface QrBoxPosition {
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

export interface SuggestedRegion {
  region: QrBoxPosition;
  regionName: string;
}

/**
 * Suggest optimal QR placement based on label dimensions.
 * Default: bottom-right corner with margin.
 * Only used when user has not manually positioned QR.
 */
export function suggestQrPlacement({
  labelWidthIn,
  labelHeightIn,
  minQrSizeIn = 0.7,
  marginIn = 0.1,
}: {
  labelWidthIn: number;
  labelHeightIn: number;
  minQrSizeIn?: number;
  marginIn?: number;
}): QrBoxPosition {
  // Ensure QR fits within label bounds
  const maxQrSize = Math.min(
    labelWidthIn - marginIn * 2,
    labelHeightIn - marginIn * 2,
    minQrSizeIn
  );
  const qrSize = Math.max(0.5, maxQrSize);

  return {
    xIn: labelWidthIn - qrSize - marginIn,
    yIn: labelHeightIn - qrSize - marginIn,
    widthIn: qrSize,
    heightIn: qrSize,
  };
}

/**
 * Calculate maximum safe QR size for a label.
 * Centers the QR with margin on all sides.
 */
export function calculateMaxQrSize({
  labelWidthIn,
  labelHeightIn,
  marginIn = 0.1,
}: {
  labelWidthIn: number;
  labelHeightIn: number;
  marginIn?: number;
}): QrBoxPosition {
  const maxSize = Math.min(
    labelWidthIn - marginIn * 2,
    labelHeightIn - marginIn * 2
  );
  const safeSize = Math.max(0.5, maxSize);

  return {
    xIn: (labelWidthIn - safeSize) / 2,
    yIn: (labelHeightIn - safeSize) / 2,
    widthIn: safeSize,
    heightIn: safeSize,
  };
}

/**
 * Find largest empty region for QR placement (heuristic-based).
 * Uses predefined zones rather than collision detection.
 * Biased toward bottom-right (convention for QR placement).
 */
export function findLargestEmptyRegion({
  labelWidthIn,
  labelHeightIn,
  qrSizeIn = 0.7,
  marginIn = 0.1,
}: {
  labelWidthIn: number;
  labelHeightIn: number;
  qrSizeIn?: number;
  marginIn?: number;
}): SuggestedRegion[] {
  const size = Math.min(qrSizeIn, labelWidthIn - marginIn * 2, labelHeightIn - marginIn * 2);
  
  // Define candidate regions (sorted by preference)
  const regions: SuggestedRegion[] = [
    {
      regionName: 'bottom-right',
      region: {
        xIn: labelWidthIn - size - marginIn,
        yIn: labelHeightIn - size - marginIn,
        widthIn: size,
        heightIn: size,
      },
    },
    {
      regionName: 'bottom-left',
      region: {
        xIn: marginIn,
        yIn: labelHeightIn - size - marginIn,
        widthIn: size,
        heightIn: size,
      },
    },
    {
      regionName: 'top-right',
      region: {
        xIn: labelWidthIn - size - marginIn,
        yIn: marginIn,
        widthIn: size,
        heightIn: size,
      },
    },
    {
      regionName: 'top-left',
      region: {
        xIn: marginIn,
        yIn: marginIn,
        widthIn: size,
        heightIn: size,
      },
    },
    {
      regionName: 'center',
      region: {
        xIn: (labelWidthIn - size) / 2,
        yIn: (labelHeightIn - size) / 2,
        widthIn: size,
        heightIn: size,
      },
    },
  ];

  return regions;
}

/**
 * Convert absolute QR box position to offset/scale values.
 * Used when saving QR position from the visual editor.
 */
export function qrBoxToOffsetScale({
  qrBox,
  placeholderBox,
  svgUnitsPerInch = 96,
}: {
  qrBox: QrBoxPosition;
  placeholderBox: { x: number; y: number; width: number; height: number };
  svgUnitsPerInch?: number;
}): { qrScale: number; qrOffsetX: number; qrOffsetY: number } {
  // Calculate scale based on width ratio
  const placeholderWidthIn = placeholderBox.width / svgUnitsPerInch;
  const qrScale = qrBox.widthIn / placeholderWidthIn;

  // Calculate offset from placeholder center to new QR center
  const placeholderCenterXIn = (placeholderBox.x + placeholderBox.width / 2) / svgUnitsPerInch;
  const placeholderCenterYIn = (placeholderBox.y + placeholderBox.height / 2) / svgUnitsPerInch;
  
  const qrCenterXIn = qrBox.xIn + qrBox.widthIn / 2;
  const qrCenterYIn = qrBox.yIn + qrBox.heightIn / 2;

  // Convert inch offset back to SVG units
  const qrOffsetX = (qrCenterXIn - placeholderCenterXIn) * svgUnitsPerInch;
  const qrOffsetY = (qrCenterYIn - placeholderCenterYIn) * svgUnitsPerInch;

  return { qrScale, qrOffsetX, qrOffsetY };
}

/**
 * Convert offset/scale values to absolute QR box position.
 * Used when initializing the visual editor.
 */
export function offsetScaleToQrBox({
  qrScale,
  qrOffsetX,
  qrOffsetY,
  placeholderBox,
  svgUnitsPerInch = 96,
}: {
  qrScale: number;
  qrOffsetX: number;
  qrOffsetY: number;
  placeholderBox: { x: number; y: number; width: number; height: number };
  svgUnitsPerInch?: number;
}): QrBoxPosition {
  // Calculate QR size based on placeholder and scale
  const placeholderWidthIn = placeholderBox.width / svgUnitsPerInch;
  const qrSizeIn = placeholderWidthIn * qrScale;

  // Calculate placeholder center in inches
  const placeholderCenterXIn = (placeholderBox.x + placeholderBox.width / 2) / svgUnitsPerInch;
  const placeholderCenterYIn = (placeholderBox.y + placeholderBox.height / 2) / svgUnitsPerInch;

  // Apply offset (convert from SVG units to inches)
  const qrCenterXIn = placeholderCenterXIn + qrOffsetX / svgUnitsPerInch;
  const qrCenterYIn = placeholderCenterYIn + qrOffsetY / svgUnitsPerInch;

  return {
    xIn: qrCenterXIn - qrSizeIn / 2,
    yIn: qrCenterYIn - qrSizeIn / 2,
    widthIn: qrSizeIn,
    heightIn: qrSizeIn,
  };
}


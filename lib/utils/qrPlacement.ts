/**
 * QR Placement Utilities (Client-Safe)
 * 
 * Pure functions for QR positioning calculations.
 * Can be safely imported in both client and server components.
 * 
 * NOTE: This file is maintained for backwards compatibility.
 * New code should use lib/types/placement.ts directly.
 */

import type { Placement } from '@/lib/types/placement';

// Re-export Placement as QrBoxPosition for backwards compatibility
export type QrBoxPosition = Omit<Placement, 'rotation'>;

export interface SuggestedRegion {
  region: QrBoxPosition;
  regionName: string;
}

/**
 * Suggest optimal QR placement based on label dimensions.
 * Default: bottom-right corner with margin.
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
 * Find candidate regions for QR placement.
 * Returns regions sorted by preference (bottom-right first).
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
  
  return [
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
}

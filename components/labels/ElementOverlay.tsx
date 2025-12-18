'use client';

/**
 * @deprecated This file is part of the old Phase 2 implementation.
 * It has been replaced by SvgInteractionLayer.tsx which uses SVG-native coordinates.
 * 
 * The old implementation used DOM overlays with pxPerInch conversions, which caused:
 * - Drag boxes not lining up visually
 * - Rotation not working correctly
 * - Elements drifting after save/reload
 * 
 * The new SvgInteractionLayer uses SVG viewBox units directly, eliminating
 * all coordinate system translation issues.
 * 
 * This file is kept for reference only. Do not use.
 */

import type { PlaceableElement, Placement } from '@/lib/types/placement';

interface ElementOverlayProps {
  elements: PlaceableElement[];
  selectedId: string | null;
  labelWidthIn: number;
  labelHeightIn: number;
  containerWidth: number;
  containerHeight: number;
  pxPerInchX: number;
  pxPerInchY: number;
  onElementChange: (id: string, updates: Partial<Placement>) => void;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
  zoomScale?: number;
}

/**
 * @deprecated Use SvgInteractionLayer instead.
 */
export default function ElementOverlay(_props: ElementOverlayProps) {
  console.warn(
    '[DEPRECATED] ElementOverlay is deprecated and no longer functional. ' +
    'Use SvgInteractionLayer instead for SVG-native interaction.'
  );
  return null;
}

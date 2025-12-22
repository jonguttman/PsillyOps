/**
 * Seal QR Renderer — Dot-Based Module Rendering (SEAL MODE ONLY)
 * 
 * CRITICAL: This renderer is EXCLUSIVELY for TripDAR seals.
 * It uses QrRenderMode.SEAL and NEVER falls back to square modules.
 * 
 * For product label QRs, use labelService.ts which uses QrRenderMode.LABEL.
 * 
 * Replaces square QR modules with circular dots that visually dissolve
 * into the spore field. The QR no longer appears as a square grid.
 * 
 * VISUAL GOALS:
 * - Circular modules (<circle> elements) instead of squares
 * - Custom finder patterns with radar aesthetic (concentric circles)
 * - QR feels embedded in spore field, not placed on top
 * - Transparent background — spore field shows through gaps
 * 
 * INVARIANTS:
 * - Token encoding unchanged
 * - Error correction level unchanged (M = 15%)
 * - Scan reliability must be preserved
 * - Deterministic output (same token = same QR)
 * - NO FALLBACK TO SQUARE MODULES - throws error instead
 * 
 * PERFORMANCE:
 * - Single <g> element containing all <circle> elements
 * - No per-module filters or effects
 * - Avoids "SVG node limit reached" errors
 */

import QRCode from 'qrcode';
import { SEAL_QR_URL_PREFIX, QR_ERROR_CORRECTION_LEVEL } from '@/lib/constants/seal';
import { QrRenderMode } from '@/lib/types/qr';

// QR Cloud center coordinates (from base SVG viewBox: 0 0 1000 1000)
const QR_CLOUD_CENTER_X = 500;
const QR_CLOUD_CENTER_Y = 500;

// Inner radar diameter in SVG units (approximate from base SVG)
// The inner radar area is roughly 500 units in diameter
const INNER_RADAR_DIAMETER = 500;

// QR should occupy ~68% of inner radar diameter (increased from ~50%)
const QR_RADIUS_FACTOR = 0.68;

// Module rendering
const MODULE_RADIUS_FACTOR = 0.42; // Circle radius as fraction of module size

// Finder pattern dimensions (in modules)
const FINDER_SIZE = 7; // Standard QR finder pattern is 7x7 modules

interface QrMatrix {
  modules: boolean[][];
  size: number;
}

/**
 * Map error correction percentage (7-30) to QR library level
 * 
 * QR Error Correction Levels:
 * - L: ~7% recovery capacity
 * - M: ~15% recovery capacity  
 * - Q: ~25% recovery capacity
 * - H: ~30% recovery capacity
 * 
 * The slider provides a continuous feel, but internally maps to discrete levels
 */
function mapErrorCorrectionLevel(percentage: number): 'L' | 'M' | 'Q' | 'H' {
  // Clamp to valid range
  const clamped = Math.max(7, Math.min(30, percentage));
  
  // Map to nearest level based on midpoints between actual recovery rates
  // L=7%, M=15%, Q=25%, H=30%
  // Midpoints: 11% (L/M), 20% (M/Q), 27.5% (Q/H)
  if (clamped < 11) return 'L';
  if (clamped < 20) return 'M';
  if (clamped < 27.5) return 'Q';
  return 'H';
}

/**
 * Get the actual recovery percentage for a QR level
 */
export function getActualRecoveryPercent(level: 'L' | 'M' | 'Q' | 'H'): number {
  switch (level) {
    case 'L': return 7;
    case 'M': return 15;
    case 'Q': return 25;
    case 'H': return 30;
  }
}

/**
 * Get the QR level from a percentage for display purposes
 */
export function getErrorCorrectionLevel(percentage: number): { level: 'L' | 'M' | 'Q' | 'H'; actualPercent: number } {
  const level = mapErrorCorrectionLevel(percentage);
  return { level, actualPercent: getActualRecoveryPercent(level) };
}

/**
 * Finder pattern position and size information
 * Used by spore field service to create exclusion zones
 */
export interface FinderInfo {
  /** Center X in SVG coordinates (0-1000) */
  centerX: number;
  /** Center Y in SVG coordinates (0-1000) */
  centerY: number;
  /** Outer radius of the finder pattern in SVG units */
  outerRadius: number;
}

/**
 * QR geometry information for spore field coordination
 * 
 * CRITICAL: This interface provides all data needed for module-level
 * spore masking. The spore field service uses this to ensure:
 * - No spores inside dark modules
 * - Faint spores only inside light modules
 * - Edge buffer around module boundaries
 */
export interface QrGeometry {
  /** QR radius in SVG units */
  radius: number;
  /** QR center X in SVG coordinates */
  centerX: number;
  /** QR center Y in SVG coordinates */
  centerY: number;
  /** Finder pattern positions and sizes */
  finders: FinderInfo[];
  /** Module size in SVG units */
  moduleSize: number;
  
  // === NEW: Module matrix for spore masking ===
  /** Full boolean matrix of QR modules (true = dark, false = light) */
  modules: boolean[][];
  /** Number of modules per side */
  moduleCount: number;
  /** Module size in PNG pixel space (512x512 canvas) */
  moduleSizePx: number;
  /** QR top-left X in PNG pixel space */
  qrTopLeftPx: { x: number; y: number };
}

/**
 * Generate QR matrix from token
 * Returns the boolean matrix directly, not SVG
 * 
 * @param token - The QR token to encode
 * @param errorCorrectionPercent - Error correction as percentage (7-30), default 15
 */
async function generateQrMatrix(
  token: string, 
  errorCorrectionPercent?: number
): Promise<QrMatrix & { errorLevel: 'L' | 'M' | 'Q' | 'H' }> {
  const sealUrl = `${SEAL_QR_URL_PREFIX}${token}`;
  
  // Map percentage to QR level (default to M = 15%)
  const errorLevel = mapErrorCorrectionLevel(errorCorrectionPercent ?? 15);
  
  // Use QRCode.create to get raw matrix data
  const qr = QRCode.create(sealUrl, {
    errorCorrectionLevel: errorLevel,
  });
  
  const size = qr.modules.size;
  const data = qr.modules.data;
  
  // Convert flat Uint8Array to 2D boolean matrix
  const modules: boolean[][] = [];
  for (let row = 0; row < size; row++) {
    const rowData: boolean[] = [];
    for (let col = 0; col < size; col++) {
      const idx = row * size + col;
      rowData.push(data[idx] === 1);
    }
    modules.push(rowData);
  }
  
  return { modules, size, errorLevel };
}

/**
 * Check if a cell is part of a finder pattern
 * Finder patterns are in the three corners: top-left, top-right, bottom-left
 */
function isFinderPatternCell(row: number, col: number, size: number): boolean {
  // Top-left finder (0,0) to (6,6)
  if (row < FINDER_SIZE && col < FINDER_SIZE) return true;
  
  // Top-right finder
  if (row < FINDER_SIZE && col >= size - FINDER_SIZE) return true;
  
  // Bottom-left finder
  if (row >= size - FINDER_SIZE && col < FINDER_SIZE) return true;
  
  return false;
}

/**
 * Render a circular finder pattern with radar aesthetic
 * 
 * Structure:
 * - Outer ring (thick stroke, no fill)
 * - Middle ring (transparent/gap)
 * - Center dot (filled)
 * 
 * This replaces the standard square finder blocks with concentric circles
 */
function renderFinderPattern(
  centerX: number,
  centerY: number,
  moduleSize: number,
  finderModules: number = FINDER_SIZE,
  color: string = '#000000'
): string {
  // Finder pattern is 7x7 modules
  // Center of the finder pattern
  const finderRadius = (finderModules * moduleSize) / 2;
  
  // Outer ring: covers modules 0-6 (full 7x7)
  const outerRadius = finderRadius - moduleSize * 0.15;
  const outerStroke = moduleSize * 0.85;
  
  // Inner ring gap: modules 1-5 (white ring in standard QR)
  // We skip this for transparency
  
  // Center dot: modules 2-4 (3x3 center)
  const centerDotRadius = moduleSize * 1.5;
  
  return `
    <!-- Finder pattern at (${centerX.toFixed(1)}, ${centerY.toFixed(1)}) -->
    <circle 
      cx="${centerX}" 
      cy="${centerY}" 
      r="${outerRadius}" 
      fill="none" 
      stroke="${color}" 
      stroke-width="${outerStroke}"
      opacity="0.95"
    />
    <circle 
      cx="${centerX}" 
      cy="${centerY}" 
      r="${centerDotRadius}" 
      fill="${color}"
      opacity="0.95"
    />`;
}

/**
 * Result of QR rendering including SVG and geometry for spore coordination
 */
export interface QrRenderResult {
  /** SVG group element containing the QR code */
  svg: string;
  /** Geometry information for spore field coordination */
  geometry: QrGeometry;
  /** Render mode used (always SEAL for this renderer) */
  mode: QrRenderMode;
  /** Number of circular modules rendered */
  circleCount: number;
}

/**
 * Options for QR rendering
 */
export interface QrRenderOptions {
  /**
   * Contrast boost multiplier (1.0 = normal, >1.0 = darker/larger dots)
   * Range: 1.0-1.5
   * Default: 1.0
   */
  contrastBoost?: number;
  
  /**
   * Rotation angle in degrees (0-360)
   * Default: 0
   * NOTE: This also rotates the finder pattern positions for spore field exclusion
   */
  rotation?: number;
  
  /**
   * Color of QR dots/modules
   * Hex color string
   * Default: '#000000'
   */
  dotColor?: string;
  
  /**
   * Size of dots as fraction of module size (0.5-1.2)
   * 1.0 = dots touch edges, >1.0 = overlapping dots
   * Default: 1.0
   */
  dotSize?: number;
  
  /**
   * Shape of QR dots
   * 'circle' = round dots (default)
   * 'diamond' = rotated squares
   */
  dotShape?: 'circle' | 'diamond';
  
  /**
   * Error correction level as a percentage (7-30%)
   * Maps to QR levels: L (7%), M (15%), Q (25%), H (30%)
   * Default: 15 (M)
   */
  errorCorrection?: number;
}

/**
 * Render dot-based QR code (SEAL MODE ONLY)
 * 
 * CRITICAL: This function uses QrRenderMode.SEAL exclusively.
 * It renders ALL modules as <circle> elements, NEVER as <rect> or <path>.
 * If rendering fails, it throws an error - NO FALLBACK to square modules.
 * 
 * Layering order (enforced by caller):
 * 1. Spore raster (background)
 * 2. Radar rings
 * 3. This QR (dot-based circles)
 * 4. Sweep lines
 * 5. Outer typography
 * 
 * Returns both SVG and geometry info for spore field coordination.
 * 
 * @param token - The QR token to encode
 * @param radius - The radius of the QR code in SVG units
 * @param options - Optional rendering options (contrast boost, etc.)
 * @throws Error if rendering fails (no fallback allowed in SEAL mode)
 */
// SVG to PNG scale factor (SVG is 1000x1000, PNG is 512x512)
const SVG_TO_PNG_SCALE = 512 / 1000;

/**
 * Rotate a point around a center point by a given angle in degrees
 */
function rotatePoint(
  x: number, 
  y: number, 
  centerX: number, 
  centerY: number, 
  angleDegrees: number
): { x: number; y: number } {
  if (angleDegrees === 0) return { x, y };
  
  const angleRadians = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  
  // Translate to origin, rotate, translate back
  const dx = x - centerX;
  const dy = y - centerY;
  
  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}

/**
 * Render a single module as either a circle or diamond
 */
function renderModule(
  cx: number, 
  cy: number, 
  radius: number, 
  color: string, 
  shape: 'circle' | 'diamond'
): string {
  if (shape === 'diamond') {
    // Diamond is a rotated square - use path for precise control
    // Diamond points at top, right, bottom, left
    const d = radius; // "radius" to corners
    return `<path d="M${cx},${cy - d} L${cx + d},${cy} L${cx},${cy + d} L${cx - d},${cy} Z" fill="${color}"/>`;
  }
  // Default: circle
  return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${radius.toFixed(2)}" fill="${color}"/>`;
}

export async function renderDotBasedQr(
  token: string,
  radius: number,
  options?: QrRenderOptions
): Promise<QrRenderResult> {
  // SEAL MODE ENFORCEMENT: This renderer ONLY produces circular dots
  const mode = QrRenderMode.SEAL;
  
  // Extract error correction first since it affects QR matrix generation
  const errorCorrectionPercent = options?.errorCorrection ?? 15;
  const { modules, size, errorLevel } = await generateQrMatrix(token, errorCorrectionPercent);
  
  // Extract other options with defaults
  const contrastBoost = options?.contrastBoost ?? 1.0;
  const rotation = options?.rotation ?? 0;
  const dotColor = options?.dotColor ?? '#000000';
  const dotSize = options?.dotSize ?? 1.0; // Default: dots touch edges
  const dotShape = options?.dotShape ?? 'circle';
  
  // Calculate module size based on target radius
  const diameter = radius * 2;
  const moduleSize = diameter / size;
  
  // Apply dot size and contrast boost to radius
  // dotSize: 0.5-1.0 controls base size, contrastBoost: 1.0-1.5 scales up further
  const baseRadius = moduleSize * (dotSize / 2);
  const dotRadius = baseRadius * Math.sqrt(contrastBoost); // sqrt for area-based scaling
  
  // Calculate offset to center QR in the cloud zone (SVG space)
  const qrStartX = QR_CLOUD_CENTER_X - radius;
  const qrStartY = QR_CLOUD_CENTER_Y - radius;
  
  // Calculate PNG-space coordinates for spore masking
  const moduleSizePx = moduleSize * SVG_TO_PNG_SCALE;
  const qrTopLeftPx = {
    x: qrStartX * SVG_TO_PNG_SCALE,
    y: qrStartY * SVG_TO_PNG_SCALE,
  };
  
  // Finder outer radius (used for both rendering and exclusion zones)
  const finderOuterRadius = (FINDER_SIZE * moduleSize) / 2 - moduleSize * 0.15;
  
  // Calculate finder positions BEFORE rotation (in QR local space)
  const findersUnrotated: FinderInfo[] = [
    // Top-left finder
    {
      centerX: qrStartX + (FINDER_SIZE / 2) * moduleSize,
      centerY: qrStartY + (FINDER_SIZE / 2) * moduleSize,
      outerRadius: finderOuterRadius,
    },
    // Top-right finder
    {
      centerX: qrStartX + (size - FINDER_SIZE / 2) * moduleSize,
      centerY: qrStartY + (FINDER_SIZE / 2) * moduleSize,
      outerRadius: finderOuterRadius,
    },
    // Bottom-left finder
    {
      centerX: qrStartX + (FINDER_SIZE / 2) * moduleSize,
      centerY: qrStartY + (size - FINDER_SIZE / 2) * moduleSize,
      outerRadius: finderOuterRadius,
    },
  ];
  
  // CRITICAL: Apply rotation to finder positions for spore field exclusion
  // The QR visual is rotated via CSS transform, but the spore field needs
  // to know where the finders actually ARE after rotation
  const finders: FinderInfo[] = findersUnrotated.map(finder => {
    const rotated = rotatePoint(
      finder.centerX, 
      finder.centerY, 
      QR_CLOUD_CENTER_X, 
      QR_CLOUD_CENTER_Y, 
      rotation
    );
    return {
      centerX: rotated.x,
      centerY: rotated.y,
      outerRadius: finder.outerRadius,
    };
  });
  
  // Collect all dot elements
  const dots: string[] = [];
  
  // Render data modules (non-finder cells) as circles or diamonds
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Skip finder pattern cells - they get special rendering
      if (isFinderPatternCell(row, col, size)) {
        continue;
      }
      
      // Only render dark (true) modules
      if (!modules[row][col]) {
        continue;
      }
      
      // Calculate center position for this module
      const cx = qrStartX + (col + 0.5) * moduleSize;
      const cy = qrStartY + (row + 0.5) * moduleSize;
      
      dots.push(renderModule(cx, cy, dotRadius, dotColor, dotShape));
    }
  }
  
  // Render finder patterns with radar aesthetic
  // Use unrotated positions since the whole group gets rotated via transform
  const finderElements = findersUnrotated.map(finder => 
    renderFinderPattern(finder.centerX, finder.centerY, moduleSize, FINDER_SIZE, dotColor)
  ).join('\n');
  
  // SEAL MODE VALIDATION: Ensure we generated modules
  if (dots.length === 0) {
    throw new Error(
      `[SEAL MODE ERROR] No modules generated for token ${token.substring(0, 10)}. ` +
      `Seal QR fallback is forbidden - rendering must produce shapes.`
    );
  }
  
  // Combine into single group
  // Apply rotation transform around the center point
  const rotationTransform = rotation !== 0 
    ? ` transform="rotate(${rotation} ${QR_CLOUD_CENTER_X} ${QR_CLOUD_CENTER_Y})"` 
    : '';
  
  const svg = `<g id="qr-cloud" data-render-mode="SEAL" opacity="0.97"${rotationTransform}>
    <!-- SEAL MODE: ${dots.length} ${dotShape} modules, rotation: ${rotation}°, dotSize: ${dotSize}, errorLevel: ${errorLevel} (${getActualRecoveryPercent(errorLevel)}%) -->
    ${dots.join('\n    ')}
    <!-- Finder patterns (3 radar-style concentric circles) -->
    ${finderElements}
  </g>`;
  
  // Build geometry for spore field coordination
  // CRITICAL: finders array contains ROTATED positions for correct spore exclusion
  // Includes full module matrix for module-level spore masking
  const geometry: QrGeometry = {
    radius,
    centerX: QR_CLOUD_CENTER_X,
    centerY: QR_CLOUD_CENTER_Y,
    finders, // ROTATED finder positions
    moduleSize,
    // Module data for spore masking
    modules,
    moduleCount: size,
    moduleSizePx,
    qrTopLeftPx,
  };
  
  return { 
    svg, 
    geometry, 
    mode,
    circleCount: dots.length,
  };
}

/**
 * Calculate optimal QR radius based on inner radar diameter
 * QR should occupy ~68% of inner radar
 */
export function calculateQrRadius(): number {
  return (INNER_RADAR_DIAMETER * QR_RADIUS_FACTOR) / 2;
}

/**
 * Get QR rendering metadata for logging
 * Always returns SEAL mode for this renderer
 */
export function getQrRenderingMetadata(): {
  mode: QrRenderMode;
  radiusFactor: number;
  moduleRadiusFactor: number;
  moduleShape: 'circle';
  finderStyle: string;
} {
  return {
    mode: QrRenderMode.SEAL,
    radiusFactor: QR_RADIUS_FACTOR,
    moduleRadiusFactor: MODULE_RADIUS_FACTOR,
    moduleShape: 'circle', // SEAL mode always uses circles
    finderStyle: 'radar-concentric',
  };
}


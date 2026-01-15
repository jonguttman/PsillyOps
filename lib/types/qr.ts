/**
 * QR Render Mode Types
 * 
 * CRITICAL DESIGN DECISION:
 * This enum explicitly separates two incompatible QR rendering use cases.
 * DO NOT attempt to unify or simplify these modes.
 * 
 * The separation is required for long-term stability:
 * - Label QRs must remain maximally scannable (square, boring)
 * - Seal QRs must be visually integrated (dot-based, organic)
 */

/**
 * QR rendering mode determines visual style and constraints
 */
export enum QrRenderMode {
  /**
   * LABEL mode: Classic square QR for product labels
   * - Square modules (rects)
   * - Maximum contrast
   * - Standard finder patterns
   * - No artistic effects
   * - Uses QRCode.toString() directly
   */
  LABEL = 'LABEL',

  /**
   * SEAL mode: Dot-based QR for TripDAR seals
   * - Circular modules (circles)
   * - Radar-style finder patterns
   * - Visually integrated with spore field
   * - NO automatic fallback to square
   * - Must throw error if rendering fails
   */
  SEAL = 'SEAL',
}

/**
 * QR render configuration based on mode
 */
export interface QrRenderConfig {
  mode: QrRenderMode;
  /** Token or URL to encode */
  data: string;
  /** Target size in SVG units or pixels */
  size?: number;
  /** Error correction level */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

/**
 * Validate that a render mode is explicitly set
 * Throws if mode is undefined or invalid
 */
export function validateRenderMode(mode: unknown): QrRenderMode {
  if (mode === QrRenderMode.LABEL) return QrRenderMode.LABEL;
  if (mode === QrRenderMode.SEAL) return QrRenderMode.SEAL;
  throw new Error(
    `Invalid QR render mode: ${mode}. Must be explicitly set to LABEL or SEAL.`
  );
}

/**
 * Check if a mode allows fallback to square modules
 * SEAL mode explicitly forbids fallbacks
 */
export function allowsFallback(mode: QrRenderMode): boolean {
  switch (mode) {
    case QrRenderMode.LABEL:
      return true; // Labels can use any scannable format
    case QrRenderMode.SEAL:
      return false; // Seals must use dot-based rendering or fail
    default:
      return false;
  }
}


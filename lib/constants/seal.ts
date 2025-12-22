/**
 * Seal Generation Constants
 * 
 * Single source of truth for seal generator configuration.
 */

export const SEAL_VERSION = 'seal_v1';

// QR Cloud Zone Configuration
// QR should fill most of the inner radar area, extending past the innermost ring
// Target QR radius ≈ 223 SVG units (165 × 1.35 = 35% larger)
// QR diameter = 446, extends well into the radar field
export const QR_CLOUD_EFFECTIVE_RADIUS = 223;  // Large QR that dominates the radar interior

// Seal Diameter Presets (inches)
export const SEAL_DIAMETER_PRESETS = [1.25, 1.5, 2.0] as const;
export type SealDiameterPreset = typeof SEAL_DIAMETER_PRESETS[number];
export const DEFAULT_SEAL_DIAMETER: SealDiameterPreset = 1.5;

// Base SVG Path
export const SEAL_BASE_SVG_PATH = '/tripdar_seal_base_and_text.svg';

// Base SVG Checksum (SHA-256)
// This ensures the base SVG hasn't changed unexpectedly, preserving determinism
export const SEAL_BASE_SVG_CHECKSUM = 'd6879a147e94f4a9440df5905ca405707ba288d136fb5475033cfeae4116185b';

// Sheet Layout Version
export const SHEET_LAYOUT_VERSION = 'layout_v1';

// QR Code Configuration
export const QR_ERROR_CORRECTION_LEVEL = 'M' as const; // 15% recovery - balances density with reliability
export const SEAL_QR_URL_PREFIX = 'https://originalpsilly.com/seal/';

// Batch Generation Limits
export const MAX_TOKENS_PER_BATCH = 250;
export const MAX_PAGES_PER_REQUEST = 100;


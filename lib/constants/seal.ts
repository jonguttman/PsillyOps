/**
 * Seal Generation Constants
 * 
 * Single source of truth for seal generator configuration.
 * 
 * CRITICAL: These constants are SEAL-SPECIFIC.
 * Do NOT reuse for label QR codes.
 * Label QRs use separate constants in labelService.ts.
 */

export const SEAL_VERSION = 'seal_v1';

// ============================================
// SEAL QR CONFIGURATION (SEAL MODE ONLY)
// ============================================
// These constants control dot-based QR rendering for TripDAR seals.
// They are NOT used for product label QRs.

// Inner radar diameter is ~500 SVG units
export const INNER_RADAR_DIAMETER = 500;

// SEAL_QR_SCALE: 35% larger than baseline for 1-inch print scanning
export const SEAL_QR_SCALE = 1.35;

// SEAL_QR_RADIUS: QR should occupy ~85% of inner radar diameter
// Calculated as: (INNER_RADAR_DIAMETER / 2) * 0.85 * SEAL_QR_SCALE ≈ 230
export const SEAL_QR_RADIUS = Math.round((INNER_RADAR_DIAMETER / 2) * 0.85);

// Legacy alias for backward compatibility
export const QR_RADIUS_FACTOR = 0.92;
export const QR_CLOUD_EFFECTIVE_RADIUS = SEAL_QR_RADIUS;

// SEAL_QR_QUIET_CORE: Hard quiet zone where NO spores are allowed
// This is critical for camera binarization - must be completely clear
export const SEAL_QR_QUIET_CORE_FACTOR = 0.55; // 55% of QR radius is spore-free

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

// Seal QR URL prefix - uses environment variable or falls back to production URL
// Set NEXT_PUBLIC_BASE_URL in .env for local development (e.g., http://localhost:3000)
export const SEAL_QR_URL_PREFIX = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://originalpsilly.com'}/seal/`;

// Batch Generation Limits
export const MAX_TOKENS_PER_BATCH = 250;
export const MAX_PAGES_PER_REQUEST = 100;


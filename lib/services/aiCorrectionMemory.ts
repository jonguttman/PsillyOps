// AI CORRECTION MEMORY
// Simple in-memory lookup for user corrections
// NOT ML/training - just a lookup table

type CorrectionMap = Record<string, string>;

// In-memory correction maps (can be persisted to DB later)
let materialCorrections: CorrectionMap = {};
let productCorrections: CorrectionMap = {};
let retailerCorrections: CorrectionMap = {};
let locationCorrections: CorrectionMap = {};

/**
 * Apply known corrections to an input string
 * Checks all correction maps and returns the corrected value if found
 */
export function applyCorrections(input: string): string {
  const lower = input.toLowerCase().trim();
  
  // Check each correction map
  return materialCorrections[lower] 
    ?? productCorrections[lower] 
    ?? retailerCorrections[lower] 
    ?? locationCorrections[lower] 
    ?? input;
}

/**
 * Apply corrections specifically for material references
 */
export function applyMaterialCorrection(input: string): string {
  const lower = input.toLowerCase().trim();
  return materialCorrections[lower] ?? input;
}

/**
 * Apply corrections specifically for product references
 */
export function applyProductCorrection(input: string): string {
  const lower = input.toLowerCase().trim();
  return productCorrections[lower] ?? input;
}

/**
 * Apply corrections specifically for retailer references
 */
export function applyRetailerCorrection(input: string): string {
  const lower = input.toLowerCase().trim();
  return retailerCorrections[lower] ?? input;
}

/**
 * Apply corrections specifically for location references
 */
export function applyLocationCorrection(input: string): string {
  const lower = input.toLowerCase().trim();
  return locationCorrections[lower] ?? input;
}

/**
 * Record a user correction for future use
 */
export function recordCorrection(
  type: 'material' | 'product' | 'retailer' | 'location',
  original: string,
  corrected: string
): void {
  const lower = original.toLowerCase().trim();
  
  // Don't record if they're the same
  if (lower === corrected.toLowerCase().trim()) return;
  
  switch (type) {
    case 'material':
      materialCorrections[lower] = corrected;
      break;
    case 'product':
      productCorrections[lower] = corrected;
      break;
    case 'retailer':
      retailerCorrections[lower] = corrected;
      break;
    case 'location':
      locationCorrections[lower] = corrected;
      break;
  }
  
  console.log(`[AI Correction] Recorded: "${original}" → "${corrected}" (${type})`);
}

/**
 * Record a general correction (auto-detects type based on context)
 */
export function recordGeneralCorrection(original: string, corrected: string): void {
  // For now, store in material corrections as default
  // In future, could analyze context to determine type
  recordCorrection('material', original, corrected);
}

/**
 * Get all current corrections (for debugging/export)
 */
export function getAllCorrections(): {
  materials: CorrectionMap;
  products: CorrectionMap;
  retailers: CorrectionMap;
  locations: CorrectionMap;
} {
  return {
    materials: { ...materialCorrections },
    products: { ...productCorrections },
    retailers: { ...retailerCorrections },
    locations: { ...locationCorrections },
  };
}

/**
 * Clear all corrections (for testing)
 */
export function clearAllCorrections(): void {
  materialCorrections = {};
  productCorrections = {};
  retailerCorrections = {};
  locationCorrections = {};
}

/**
 * Load corrections from a saved state (for persistence)
 */
export function loadCorrections(saved: {
  materials?: CorrectionMap;
  products?: CorrectionMap;
  retailers?: CorrectionMap;
  locations?: CorrectionMap;
}): void {
  if (saved.materials) materialCorrections = { ...saved.materials };
  if (saved.products) productCorrections = { ...saved.products };
  if (saved.retailers) retailerCorrections = { ...saved.retailers };
  if (saved.locations) locationCorrections = { ...saved.locations };
}




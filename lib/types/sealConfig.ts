/**
 * Seal Configuration Types
 * 
 * This module defines the configuration interface for TripDAR seal generation.
 * All seal rendering is driven by SporeFieldConfig objects.
 * 
 * CRITICAL: This is a calibration system, not a production generator.
 * - All previews use TUNER_PREVIEW_001 token
 * - No token generation during tuning
 * - Config snapshots are stored for reproducibility
 */

/**
 * Base preset identifiers
 * Each preset uses a DIFFERENT ALGORITHM, not just different parameter values.
 */
export type BasePresetId = 
  | 'dot-zones'        // v5: Basic radial zones, no module awareness
  | 'zone-system'      // v6: 3-zone + hard quiet core, finder exclusion
  | 'module-masked'    // v7: Full module matrix masking
  | 'material-unified'; // v8: Particle size convergence

/**
 * Base layer color and opacity configuration
 * Controls the appearance of SVG elements in the seal template
 */
export interface BaseLayerConfig {
  /** Outer ring (thick border) */
  outerRing: {
    color: string;    // Hex color, e.g., '#000000'
    opacity: number;  // 0-1
  };
  /** Text ring (TRIPDAR EXPERIENCE VERIFIED, etc.) */
  textRing: {
    color: string;
    opacity: number;
  };
  /** Radar lines (sweep lines, concentric circles) */
  radarLines: {
    color: string;
    opacity: number;
  };
}

/**
 * Complete spore field configuration
 * 
 * Different presets enable different subsets of these controls.
 * The basePreset determines which ALGORITHM is used, not just which values.
 */
export interface SporeFieldConfig {
  // ============================================
  // PRESET SELECTION (determines algorithm)
  // ============================================
  
  /**
   * Base preset type - determines the rendering algorithm
   * - dot-zones: Basic radial density, no module awareness
   * - zone-system: 3-zone + hard quiet core
   * - module-masked: Full module matrix lookup
   * - material-unified: Particle size tied to QR dots
   */
  basePreset: BasePresetId;

  // ============================================
  // CORE DENSITY CONTROLS (all presets)
  // ============================================
  
  /**
   * Total number of spore samples to generate
   * Higher = denser field, but slower generation
   * Typical range: 20000-100000
   */
  sporeCount: number;
  
  /**
   * Minimum opacity for spore particles
   * Range: 0-1
   */
  minOpacity: number;
  
  /**
   * Maximum opacity for spore particles
   * Range: 0-1
   */
  maxOpacity: number;

  // ============================================
  // ZONE CONTROLS (all presets)
  // ============================================
  
  /**
   * Where Zone A (QR core, no spores) ends
   * Expressed as fraction of QR radius (0-1)
   * Default: 0.40
   */
  zoneAEnd: number;
  
  /**
   * Where Zone B (transition) ends and Zone C (full density) begins
   * Expressed as fraction of QR radius (0-1)
   * Default: 0.70
   */
  zoneBEnd: number;

  // ============================================
  // QUIET CORE (zone-system, module-masked, material-unified)
  // ============================================
  
  /**
   * Hard quiet core radius as fraction of QR radius
   * NO spores inside this zone, regardless of other settings
   * Range: 0-1, Default: 0.55
   */
  quietCoreFactor?: number;

  // ============================================
  // MODULE MASKING (module-masked, material-unified)
  // ============================================
  
  /**
   * Edge buffer as fraction of module size
   * No spores within this distance of module grid lines
   * Range: 0-0.5, Default: 0.12
   */
  edgeBufferFactor?: number;
  
  /**
   * Density multiplier for spores inside light QR modules
   * Range: 0-1, Default: 0.10
   */
  lightModuleDensity?: number;
  
  /**
   * Maximum opacity for spores inside light QR modules
   * Range: 0-1, Default: 0.18
   */
  lightModuleMaxOpacity?: number;
  
  /**
   * Finder pattern exclusion radius multiplier
   * Applied to finder outer radius
   * Range: 1-2, Default: 1.25
   */
  finderExclusionMultiplier?: number;

  // ============================================
  // PARTICLE SIZING (material-unified only)
  // ============================================
  
  /**
   * Minimum spore radius as fraction of QR dot radius
   * Range: 0.3-1.0, Default: 0.55
   */
  sporeRadiusMinFactor?: number;
  
  /**
   * Maximum spore radius as fraction of QR dot radius
   * Range: 0.5-1.2, Default: 0.85
   */
  sporeRadiusMaxFactor?: number;

  // ============================================
  // QR CONTRAST BOOST (module-masked, material-unified)
  // ============================================
  
  /**
   * Boosts QR module contrast and increases spore suppression
   * - Darkens QR dots (radius or opacity boost)
   * - Increases spore suppression near modules
   * Range: 1.0-1.5, Default: 1.0
   */
  moduleContrastBoost?: number;

  // ============================================
  // QR SCALE (all presets)
  // ============================================
  
  /**
   * Scale factor for the QR code size
   * 1.0 = default size (85% of inner radar)
   * >1.0 = larger QR, <1.0 = smaller QR
   * Range: 0.5-1.5, Default: 1.0
   */
  qrScale?: number;

  // ============================================
  // BASE LAYER CONTROLS (all presets)
  // ============================================
  
  /**
   * Color and opacity for base SVG elements
   * Allows adjusting outer ring, text, and radar lines
   */
  baseLayerConfig: BaseLayerConfig;
}

/**
 * Metadata about which controls are available for each preset
 */
export interface PresetControlMeta {
  /** Human-readable display name */
  displayName: string;
  
  /** Short description of the preset's approach */
  description: string;
  
  /** Which optional controls are enabled */
  enabledControls: {
    quietCoreFactor: boolean;
    edgeBufferFactor: boolean;
    lightModuleDensity: boolean;
    lightModuleMaxOpacity: boolean;
    finderExclusionMultiplier: boolean;
    sporeRadiusMinFactor: boolean;
    sporeRadiusMaxFactor: boolean;
    moduleContrastBoost: boolean;
    qrScale: boolean;
  };
}

/**
 * Complete preset definition including defaults and control metadata
 */
export interface PresetDefinition {
  id: BasePresetId;
  meta: PresetControlMeta;
  defaults: SporeFieldConfig;
}

/**
 * Tooltip content for each control
 * Used in the tuner UI to explain effects
 */
export const CONTROL_TOOLTIPS: Record<string, string> = {
  // Core density
  sporeCount: 
    'Total number of spore particles to generate. Higher values create denser fields but take longer to render. Start with 40,000 and adjust based on visual density.',
  minOpacity: 
    'Minimum opacity for spore particles. Lower values create more subtle, atmospheric spores. Too low may be invisible when printed.',
  maxOpacity: 
    'Maximum opacity for spore particles. Higher values create bolder spores but may interfere with QR scanning if too dense.',
  
  // Zone controls
  zoneAEnd: 
    'Where Zone A (no spores) ends, as a fraction of QR radius. Larger values keep more space clear around the QR center for scan reliability.',
  zoneBEnd: 
    'Where Zone B (transition) ends and full-density Zone C begins. Controls how gradually spores fade toward the QR.',
  
  // Quiet core
  quietCoreFactor: 
    'Hard quiet core radius. NO spores are ever placed inside this zone, regardless of other settings. Critical for scan reliability.',
  
  // Module masking
  edgeBufferFactor: 
    'Buffer zone around QR module edges where no spores are placed. Prevents spores from hugging grid lines and creating visual noise.',
  lightModuleDensity: 
    'How many spores are allowed inside light (white) QR modules. Lower values keep light modules cleaner for better contrast.',
  lightModuleMaxOpacity: 
    'Maximum opacity for spores inside light modules. Keeps any allowed spores subtle so they don\'t reduce scan reliability.',
  finderExclusionMultiplier: 
    'How much larger the finder pattern exclusion zone is vs. the actual finder size. Larger values keep more space sterile around finder eyes.',
  
  // Particle sizing
  sporeRadiusMinFactor: 
    'Minimum spore size as a fraction of QR dot size. Higher values make spores more similar to QR dots for visual unity.',
  sporeRadiusMaxFactor: 
    'Maximum spore size as a fraction of QR dot size. Controls how large spores can get relative to QR dots.',
  
  // Contrast boost
  moduleContrastBoost: 
    'Increases QR dot prominence and suppresses nearby spores. Higher values make QR "fight back" against the spore field for better scanning.',
  
  // QR scale
  qrScale:
    'Scale factor for the QR code size. Values above 1.0 make the QR larger (easier to scan), values below 1.0 make it smaller (more spore field visible). Default is 1.0 (85% of inner radar).',
  
  // Base layer
  'baseLayerConfig.outerRing.color': 
    'Color of the thick outer border. Darker colors provide more contrast but may compete with QR visibility.',
  'baseLayerConfig.outerRing.opacity': 
    'Opacity of the outer ring. Reducing this can improve QR contrast but may reduce brand presence at small print sizes.',
  'baseLayerConfig.textRing.color': 
    'Color of the text ring (TRIPDAR EXPERIENCE VERIFIED, etc.). Should complement the overall seal aesthetic.',
  'baseLayerConfig.textRing.opacity': 
    'Opacity of the text ring. Lower values make text more subtle, higher values make it more prominent.',
  'baseLayerConfig.radarLines.color': 
    'Color of the radar sweep lines and concentric circles. Subtle colors work best to not interfere with QR scanning.',
  'baseLayerConfig.radarLines.opacity': 
    'Opacity of radar decorative elements. Lower values keep focus on the QR, higher values emphasize the radar aesthetic.',
};

/**
 * Fixed test token for calibration
 * NEVER generate new tokens during tuning
 */
export const TUNER_PREVIEW_TOKEN = 'TUNER_PREVIEW_001';

/**
 * Check if a token is a tuner preview token
 */
export function isTunerToken(token: string): boolean {
  return token.startsWith('TUNER_PREVIEW_');
}


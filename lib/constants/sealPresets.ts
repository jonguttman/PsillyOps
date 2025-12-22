/**
 * Seal Presets — Immutable Base Configurations
 * 
 * Each preset represents a DIFFERENT ALGORITHM, not just different parameter values.
 * These are starting points that can be cloned and customized into child presets.
 * 
 * NEVER mutate these directly — always clone when creating variants.
 */

import type { 
  BasePresetId, 
  PresetDefinition, 
  SporeFieldConfig, 
  PresetControlMeta,
  BaseLayerConfig 
} from '@/lib/types/sealConfig';

/**
 * Default base layer configuration
 * Used as starting point for all presets
 */
const DEFAULT_BASE_LAYER: BaseLayerConfig = {
  outerRing: {
    color: '#000000',
    opacity: 1.0,
  },
  textRing: {
    color: '#000000',
    opacity: 0.9,
  },
  text: {
    color: '#ffffff',
    opacity: 1.0,
    strokeWidth: 0,      // No border by default
    strokeColor: '#000000',
  },
  radarLines: {
    color: '#000000',
    opacity: 0.6,
    aboveQr: false,      // Render below QR by default
    strokeWidth: 1.0,    // Default thickness (multiplier)
  },
};

// ============================================
// PRESET 1: DOT ZONES (v5)
// Basic radial zones, no module awareness
// ============================================

const DOT_ZONES_META: PresetControlMeta = {
  displayName: 'Dot Zones',
  description: 'Basic radial density zones with small particles. Good for texture experimentation without scan-safety features.',
  enabledControls: {
    quietCoreFactor: false,
    edgeBufferFactor: false,
    lightModuleDensity: false,
    lightModuleMaxOpacity: false,
    finderExclusionMultiplier: false,
    sporeRadiusMinFactor: false,
    sporeRadiusMaxFactor: false,
    moduleContrastBoost: false,
    qrScale: true,
    qrRotation: true,
    qrDotColor: true,
    qrBgColor: true,
    qrBgOpacity: true,
  },
};

const DOT_ZONES_DEFAULTS: SporeFieldConfig = {
  basePreset: 'dot-zones',
  
  // Core density - small, numerous particles
  sporeCount: 80000,
  minOpacity: 0.15,
  maxOpacity: 0.70,
  
  // Zone boundaries
  zoneAEnd: 0.35,
  zoneBEnd: 0.65,
  
  // QR settings
  qrScale: 1.0,
  qrRotation: 0,
  qrDotColor: '#000000',
  qrBgColor: '#ffffff',
  qrBgOpacity: 0,
  
  // Not used in this preset
  quietCoreFactor: undefined,
  edgeBufferFactor: undefined,
  lightModuleDensity: undefined,
  lightModuleMaxOpacity: undefined,
  finderExclusionMultiplier: undefined,
  sporeRadiusMinFactor: undefined,
  sporeRadiusMaxFactor: undefined,
  moduleContrastBoost: undefined,
  
  baseLayerConfig: { ...DEFAULT_BASE_LAYER },
};

// ============================================
// PRESET 2: QUIET CORE (v6)
// 3-zone system with hard quiet core
// ============================================

const ZONE_SYSTEM_META: PresetControlMeta = {
  displayName: 'Quiet Core',
  description: '3-zone system with hard quiet core and finder exclusion. Baseline for scan safety without module-level awareness.',
  enabledControls: {
    quietCoreFactor: true,
    edgeBufferFactor: false,
    lightModuleDensity: false,
    lightModuleMaxOpacity: false,
    finderExclusionMultiplier: true,
    sporeRadiusMinFactor: false,
    sporeRadiusMaxFactor: false,
    moduleContrastBoost: false,
    qrScale: true,
    qrRotation: true,
    qrDotColor: true,
    qrBgColor: true,
    qrBgOpacity: true,
  },
};

const ZONE_SYSTEM_DEFAULTS: SporeFieldConfig = {
  basePreset: 'zone-system',
  
  // Core density
  sporeCount: 80000,
  minOpacity: 0.18,
  maxOpacity: 0.92,
  
  // Zone boundaries
  zoneAEnd: 0.40,
  zoneBEnd: 0.70,
  
  // QR settings
  qrScale: 1.0,
  qrRotation: 0,
  qrDotColor: '#000000',
  qrBgColor: '#ffffff',
  qrBgOpacity: 0,
  
  // Quiet core enabled
  quietCoreFactor: 0.55,
  finderExclusionMultiplier: 1.25,
  
  // Not used in this preset
  edgeBufferFactor: undefined,
  lightModuleDensity: undefined,
  lightModuleMaxOpacity: undefined,
  sporeRadiusMinFactor: undefined,
  sporeRadiusMaxFactor: undefined,
  moduleContrastBoost: undefined,
  
  baseLayerConfig: { ...DEFAULT_BASE_LAYER },
};

// ============================================
// PRESET 3: MODULE MASKED (v7)
// Full module matrix masking
// ============================================

const MODULE_MASKED_META: PresetControlMeta = {
  displayName: 'Module Masked',
  description: 'Full QR module awareness with dark/light/edge masking. Best scan reliability with small particles.',
  enabledControls: {
    quietCoreFactor: true,
    edgeBufferFactor: true,
    lightModuleDensity: true,
    lightModuleMaxOpacity: true,
    finderExclusionMultiplier: true,
    sporeRadiusMinFactor: false,
    sporeRadiusMaxFactor: false,
    moduleContrastBoost: true,
    qrScale: true,
    qrRotation: true,
    qrDotColor: true,
    qrBgColor: true,
    qrBgOpacity: true,
  },
};

const MODULE_MASKED_DEFAULTS: SporeFieldConfig = {
  basePreset: 'module-masked',
  
  // Core density - small particles
  sporeCount: 80000,
  minOpacity: 0.18,
  maxOpacity: 0.92,
  
  // Zone boundaries
  zoneAEnd: 0.40,
  zoneBEnd: 0.70,
  
  // QR settings
  qrScale: 1.0,
  qrRotation: 0,
  qrDotColor: '#000000',
  qrBgColor: '#ffffff',
  qrBgOpacity: 0,
  
  // Quiet core
  quietCoreFactor: 0.55,
  finderExclusionMultiplier: 1.25,
  
  // Module masking
  edgeBufferFactor: 0.12,
  lightModuleDensity: 0.10,
  lightModuleMaxOpacity: 0.18,
  
  // Contrast boost
  moduleContrastBoost: 1.0,
  
  // Not used in this preset
  sporeRadiusMinFactor: undefined,
  sporeRadiusMaxFactor: undefined,
  
  baseLayerConfig: { ...DEFAULT_BASE_LAYER },
};

// ============================================
// PRESET 4: MATERIAL UNIFIED (v8)
// Particle size convergence with QR dots
// ============================================

const MATERIAL_UNIFIED_META: PresetControlMeta = {
  displayName: 'Material Unified',
  description: 'Spore particles sized to match QR dots for unified "ink" aesthetic. Fewer, larger particles with opacity-based variation.',
  enabledControls: {
    quietCoreFactor: true,
    edgeBufferFactor: true,
    lightModuleDensity: true,
    lightModuleMaxOpacity: true,
    finderExclusionMultiplier: true,
    sporeRadiusMinFactor: true,
    sporeRadiusMaxFactor: true,
    moduleContrastBoost: true,
    qrScale: true,
    qrRotation: true,
    qrDotColor: true,
    qrBgColor: true,
    qrBgOpacity: true,
  },
};

const MATERIAL_UNIFIED_DEFAULTS: SporeFieldConfig = {
  basePreset: 'material-unified',
  
  // Core density - fewer, larger particles
  sporeCount: 32000, // 40% of normal
  minOpacity: 0.22,
  maxOpacity: 0.55,
  
  // Zone boundaries
  zoneAEnd: 0.40,
  zoneBEnd: 0.70,
  
  // QR settings
  qrScale: 1.0,
  qrRotation: 0,
  qrDotColor: '#000000',
  qrBgColor: '#ffffff',
  qrBgOpacity: 0,
  
  // Quiet core
  quietCoreFactor: 0.55,
  finderExclusionMultiplier: 1.25,
  
  // Module masking
  edgeBufferFactor: 0.12,
  lightModuleDensity: 0.10,
  lightModuleMaxOpacity: 0.18,
  
  // Particle sizing - tied to QR dot size
  sporeRadiusMinFactor: 0.55,
  sporeRadiusMaxFactor: 0.85,
  
  // Contrast boost
  moduleContrastBoost: 1.0,
  
  baseLayerConfig: { ...DEFAULT_BASE_LAYER },
};

// ============================================
// PRESET REGISTRY
// ============================================

export const PRESET_DEFINITIONS: Record<BasePresetId, PresetDefinition> = {
  'dot-zones': {
    id: 'dot-zones',
    meta: DOT_ZONES_META,
    defaults: DOT_ZONES_DEFAULTS,
  },
  'zone-system': {
    id: 'zone-system',
    meta: ZONE_SYSTEM_META,
    defaults: ZONE_SYSTEM_DEFAULTS,
  },
  'module-masked': {
    id: 'module-masked',
    meta: MODULE_MASKED_META,
    defaults: MODULE_MASKED_DEFAULTS,
  },
  'material-unified': {
    id: 'material-unified',
    meta: MATERIAL_UNIFIED_META,
    defaults: MATERIAL_UNIFIED_DEFAULTS,
  },
};

/**
 * Get a preset definition by ID
 */
export function getPresetDefinition(id: BasePresetId): PresetDefinition {
  const preset = PRESET_DEFINITIONS[id];
  if (!preset) {
    throw new Error(`Unknown preset ID: ${id}`);
  }
  return preset;
}

/**
 * Clone a preset's defaults for modification
 * Always use this when creating child presets
 */
export function clonePresetDefaults(id: BasePresetId): SporeFieldConfig {
  const preset = getPresetDefinition(id);
  return JSON.parse(JSON.stringify(preset.defaults));
}

/**
 * Get all preset IDs in display order
 */
export function getPresetIds(): BasePresetId[] {
  return ['dot-zones', 'zone-system', 'module-masked', 'material-unified'];
}

/**
 * Validate a config against its base preset's requirements
 */
export function validateConfig(config: SporeFieldConfig): string[] {
  const errors: string[] = [];
  
  // Required fields
  if (config.sporeCount < 1000 || config.sporeCount > 500000) {
    errors.push('sporeCount must be between 1,000 and 500,000');
  }
  
  if (config.minOpacity < 0 || config.minOpacity > 1) {
    errors.push('minOpacity must be between 0 and 1');
  }
  
  if (config.maxOpacity < 0 || config.maxOpacity > 1) {
    errors.push('maxOpacity must be between 0 and 1');
  }
  
  if (config.minOpacity > config.maxOpacity) {
    errors.push('minOpacity cannot be greater than maxOpacity');
  }
  
  if (config.zoneAEnd < 0 || config.zoneAEnd > 1) {
    errors.push('zoneAEnd must be between 0 and 1');
  }
  
  if (config.zoneBEnd < 0 || config.zoneBEnd > 1) {
    errors.push('zoneBEnd must be between 0 and 1');
  }
  
  if (config.zoneAEnd >= config.zoneBEnd) {
    errors.push('zoneAEnd must be less than zoneBEnd');
  }
  
  // Optional fields validation based on preset
  const preset = PRESET_DEFINITIONS[config.basePreset];
  if (!preset) {
    errors.push(`Unknown basePreset: ${config.basePreset}`);
    return errors;
  }
  
  const { enabledControls } = preset.meta;
  
  if (enabledControls.quietCoreFactor && config.quietCoreFactor !== undefined) {
    if (config.quietCoreFactor < 0 || config.quietCoreFactor > 1) {
      errors.push('quietCoreFactor must be between 0 and 1');
    }
  }
  
  if (enabledControls.edgeBufferFactor && config.edgeBufferFactor !== undefined) {
    if (config.edgeBufferFactor < 0 || config.edgeBufferFactor > 0.5) {
      errors.push('edgeBufferFactor must be between 0 and 0.5');
    }
  }
  
  if (enabledControls.moduleContrastBoost && config.moduleContrastBoost !== undefined) {
    if (config.moduleContrastBoost < 1.0 || config.moduleContrastBoost > 1.5) {
      errors.push('moduleContrastBoost must be between 1.0 and 1.5');
    }
  }
  
  if (enabledControls.qrScale && config.qrScale !== undefined) {
    if (config.qrScale < 0.5 || config.qrScale > 1.5) {
      errors.push('qrScale must be between 0.5 and 1.5');
    }
  }
  
  if (enabledControls.qrRotation && config.qrRotation !== undefined) {
    if (config.qrRotation < 0 || config.qrRotation > 360) {
      errors.push('qrRotation must be between 0 and 360');
    }
  }
  
  if (enabledControls.qrBgOpacity && config.qrBgOpacity !== undefined) {
    if (config.qrBgOpacity < 0 || config.qrBgOpacity > 1) {
      errors.push('qrBgOpacity must be between 0 and 1');
    }
  }
  
  return errors;
}


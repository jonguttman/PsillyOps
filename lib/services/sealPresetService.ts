/**
 * Seal Preset Service
 * 
 * Manages seal design presets and the "live" production preset.
 * 
 * The live preset is the design used for all seal generation.
 * Only admins can change the live preset.
 */

import { prisma } from '@/lib/db/prisma';
import type { SporeFieldConfig } from '@/lib/types/sealConfig';
import { clonePresetDefaults } from '@/lib/constants/sealPresets';

export interface LivePresetInfo {
  id: string;
  name: string;
  basePreset: string;
  config: SporeFieldConfig;
  updatedAt: Date;
}

/**
 * Get the currently live seal preset.
 * 
 * If no preset is set as live, returns the default "material-unified" preset.
 */
export async function getLivePreset(): Promise<LivePresetInfo | null> {
  const livePreset = await prisma.sealPreset.findFirst({
    where: { isLive: true },
    select: {
      id: true,
      name: true,
      basePreset: true,
      config: true,
      updatedAt: true,
    },
  });

  if (!livePreset) {
    return null;
  }

  return {
    id: livePreset.id,
    name: livePreset.name,
    basePreset: livePreset.basePreset,
    config: livePreset.config as SporeFieldConfig,
    updatedAt: livePreset.updatedAt,
  };
}

/**
 * Get the SporeFieldConfig for seal generation.
 * 
 * Returns the live preset's config if one is set,
 * otherwise returns the default material-unified preset.
 */
export async function getLiveSealConfig(): Promise<SporeFieldConfig> {
  const livePreset = await getLivePreset();
  
  if (livePreset) {
    return livePreset.config;
  }
  
  // Fallback to default preset
  return clonePresetDefaults('material-unified');
}

/**
 * Get a summary of the live preset for display purposes.
 * Returns null if no live preset is set.
 */
export async function getLivePresetSummary(): Promise<{
  id: string;
  name: string;
  basePreset: string;
} | null> {
  const livePreset = await prisma.sealPreset.findFirst({
    where: { isLive: true },
    select: {
      id: true,
      name: true,
      basePreset: true,
    },
  });

  return livePreset;
}


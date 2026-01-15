// Vibe Vocabulary Service
// Provides mode-specific labels for the 5 vibe axes
// Supports SystemConfig overrides for future customization

import { ExperienceMode } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export interface VibeLabels {
  transcend: string;
  energize: string;
  create: string;
  transform: string;
  connect: string;
}

// Default vocabulary mappings (code-based)
const DEFAULT_VOCABULARY: Record<ExperienceMode, VibeLabels> = {
  MICRO: {
    transcend: 'Subtle uplift',
    energize: 'Clarity / energy',
    create: 'Creative flow',
    transform: 'Perspective shift',
    connect: 'Emotional openness'
  },
  MACRO: {
    transcend: 'Mystical / beyond-self',
    energize: 'Stimulation / intensity',
    create: 'Visionary / imagination',
    transform: 'Breakthrough / dissolution',
    connect: 'Connection / unity'
  }
};

/**
 * Get vibe labels for a specific experience mode
 * Checks SystemConfig for overrides, falls back to code defaults
 */
export async function getVibeLabels(mode: ExperienceMode): Promise<VibeLabels> {
  // Try to get SystemConfig override
  const configKey = `VIBE_VOCAB_${mode}`;
  const config = await prisma.systemConfig.findUnique({
    where: { key: configKey }
  });

  if (config) {
    try {
      const parsed = JSON.parse(config.value) as VibeLabels;
      // Validate structure
      if (
        typeof parsed.transcend === 'string' &&
        typeof parsed.energize === 'string' &&
        typeof parsed.create === 'string' &&
        typeof parsed.transform === 'string' &&
        typeof parsed.connect === 'string'
      ) {
        return parsed;
      }
    } catch {
      // Invalid JSON or structure, fall back to defaults
    }
  }

  // Return code defaults
  return DEFAULT_VOCABULARY[mode];
}

/**
 * Get all vibe labels (both modes) - useful for UI that shows both
 */
export async function getAllVibeLabels(): Promise<Record<ExperienceMode, VibeLabels>> {
  const [micro, macro] = await Promise.all([
    getVibeLabels('MICRO'),
    getVibeLabels('MACRO')
  ]);

  return {
    MICRO: micro,
    MACRO: macro
  };
}


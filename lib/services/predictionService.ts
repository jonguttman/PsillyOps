// Prediction Profile Service
// Manages immutable prediction snapshots for products

import { prisma } from '@/lib/db/prisma';
import { PredictionProfile, ExperienceMode } from '@prisma/client';

export interface VibeWeights {
  transcend: number;
  energize: number;
  create: number;
  transform: number;
  connect: number;
}

/**
 * Validate vibe weights (must be non-negative and at least one must be set)
 */
export function validateVibeWeights(vibes: VibeWeights): { valid: boolean; error?: string } {
  // Check for negative values
  if (vibes.transcend < 0 || vibes.energize < 0 || vibes.create < 0 || vibes.transform < 0 || vibes.connect < 0) {
    return {
      valid: false,
      error: 'Vibe weights cannot be negative'
    };
  }
  
  // Check that at least one weight is set
  const sum = vibes.transcend + vibes.energize + vibes.create + vibes.transform + vibes.connect;
  if (sum === 0) {
    return {
      valid: false,
      error: 'At least one vibe weight must be set'
    };
  }
  
  return { valid: true };
}

/**
 * Create a new immutable prediction profile for a product
 */
export async function createPredictionProfile(
  productId: string,
  vibes: VibeWeights,
  experienceMode: ExperienceMode,
  userId?: string
): Promise<PredictionProfile> {
  // Validate weights
  const validation = validateVibeWeights(vibes);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  // Create new profile (never update existing)
  return await prisma.predictionProfile.create({
    data: {
      productId,
      experienceMode,
      transcend: vibes.transcend,
      energize: vibes.energize,
      create: vibes.create,
      transform: vibes.transform,
      connect: vibes.connect,
      vocabVersion: 1, // Start at version 1, increment for future vocabulary changes
      createdById: userId || null
    }
  });
}

/**
 * Get the active (latest non-archived) prediction profile for a product and mode
 */
export async function getActivePrediction(
  productId: string,
  experienceMode: ExperienceMode
): Promise<PredictionProfile | null> {
  return await prisma.predictionProfile.findFirst({
    where: {
      productId,
      experienceMode,
      archivedAt: null
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
}

/**
 * Get all active prediction profiles for a product (one per mode)
 */
export async function getActivePredictionsByMode(productId: string): Promise<Record<ExperienceMode, PredictionProfile | null>> {
  const [micro, macro] = await Promise.all([
    getActivePrediction(productId, 'MICRO'),
    getActivePrediction(productId, 'MACRO')
  ]);
  
  return {
    MICRO: micro,
    MACRO: macro
  };
}

/**
 * Get all prediction profiles for a product (including archived)
 */
export async function getPredictionHistory(productId: string): Promise<PredictionProfile[]> {
  return await prisma.predictionProfile.findMany({
    where: {
      productId
    },
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });
}

/**
 * Soft archive a prediction profile (never delete)
 */
export async function archivePrediction(profileId: string): Promise<PredictionProfile> {
  return await prisma.predictionProfile.update({
    where: { id: profileId },
    data: {
      archivedAt: new Date()
    }
  });
}

/**
 * Get a specific prediction profile by ID
 */
export async function getPredictionProfile(profileId: string): Promise<PredictionProfile | null> {
  return await prisma.predictionProfile.findUnique({
    where: { id: profileId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true
        }
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });
}


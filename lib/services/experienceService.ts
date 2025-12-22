// Experience Review Service
// Handles anonymous experience feedback submission and statistics

import { prisma } from '@/lib/db/prisma';
import { getActivePrediction } from './predictionService';
import { 
  getOrCreateSessionCookie, 
  logDeviceAction, 
  detectIntegrityPatterns,
  getGeoContext 
} from './deviceIntegrityService';
import type { NextRequest } from 'next/server';
import { ExperienceMode, Prisma } from '@prisma/client';

export interface SubmitReviewData {
  token: string;
  experienceMode?: ExperienceMode; // Optional - will be determined from product if not provided
  overallMatch?: number | null;
  deltas?: {
    transcend?: number | null;
    energize?: number | null;
    create?: number | null;
    transform?: number | null;
    connect?: number | null;
  };
  context?: {
    isFirstTime?: boolean | null;
    doseBandGrams?: string | null;
    doseRelative?: string | null;
    setting?: string | null;
  };
  note?: string | null;
}

export interface ReviewStats {
  total: number;
  weeklySubmissions: number;
  completionRate: number;
  skipRate: number;
  neutralRate: number;
  integrityBreakdown: {
    clean: number;
    flagged: number;
  };
  goalProgress: {
    current: number;
    target: number;
  };
  byMode: {
    MICRO: {
      total: number;
      weeklySubmissions: number;
    };
    MACRO: {
      total: number;
      weeklySubmissions: number;
    };
  };
}

/**
 * Detect content moderation flags (spam, profanity, URLs)
 */
function detectContentFlags(note: string | null | undefined): { spam: boolean; profanity: boolean; hasUrl: boolean } {
  if (!note) {
    return { spam: false, profanity: false, hasUrl: false };
  }
  
  const flags = {
    spam: false,
    profanity: false,
    hasUrl: false
  };
  
  // URL detection
  const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/i;
  if (urlPattern.test(note)) {
    flags.hasUrl = true;
    flags.spam = true; // URLs in reviews are likely spam
  }
  
  // Repeated characters (≥5 same char in a row)
  const repeatedCharPattern = /(.)\1{4,}/;
  if (repeatedCharPattern.test(note)) {
    flags.spam = true;
  }
  
  // Basic profanity detection (can be enhanced with word list)
  // For now, just flag obvious patterns
  const profanityPattern = /\b(fuck|shit|damn|bitch|asshole)\b/i;
  if (profanityPattern.test(note)) {
    flags.profanity = true;
  }
  
  return flags;
}

/**
 * Calculate completion metrics
 */
function calculateCompletion(data: SubmitReviewData): {
  questionsAnswered: number;
  questionsSkipped: number;
  completionRate: number;
} {
  let answered = 0;
  let skipped = 0;
  
  // Overall match
  if (data.overallMatch !== null && data.overallMatch !== undefined) {
    answered++;
  } else {
    skipped++;
  }
  
  // Vibe deltas (5 questions)
  const deltas = data.deltas || {};
  ['transcend', 'energize', 'create', 'transform', 'connect'].forEach(vibe => {
    const value = deltas[vibe as keyof typeof deltas];
    if (value !== null && value !== undefined) {
      answered++;
    } else {
      skipped++;
    }
  });
  
  // Context questions (4 questions)
  const context = data.context || {};
  ['isFirstTime', 'doseBandGrams', 'doseRelative', 'setting'].forEach(field => {
    const value = context[field as keyof typeof context];
    if (value !== null && value !== undefined) {
      answered++;
    } else {
      skipped++;
    }
  });
  
  // Note (optional)
  if (data.note) {
    answered++;
  } else {
    skipped++;
  }
  
  const total = answered + skipped;
  const completionRate = total > 0 ? answered / total : 0;
  
  return {
    questionsAnswered: answered,
    questionsSkipped: skipped,
    completionRate
  };
}

/**
 * Submit an experience review
 */
export async function submitReview(
  data: SubmitReviewData,
  request: NextRequest
): Promise<{ reviewId: string }> {
  // 1. Resolve QR token to entity
  const qrToken = await prisma.qRToken.findUnique({
    where: { token: data.token },
    include: {
      // Token has entityType and entityId, we need to resolve to Product/Batch
    }
  });
  
  if (!qrToken || qrToken.status !== 'ACTIVE') {
    throw new Error('Invalid or inactive QR token');
  }
  
  // Resolve entity to Product (and optionally Batch)
  let productId: string;
  let batchId: string | null = null;
  
  if (qrToken.entityType === 'PRODUCT') {
    productId = qrToken.entityId;
  } else if (qrToken.entityType === 'BATCH') {
    // Get batch to find product
    const batch = await prisma.batch.findUnique({
      where: { id: qrToken.entityId },
      select: { productId: true, id: true }
    });
    
    if (!batch) {
      throw new Error('Batch not found for QR token');
    }
    
    productId = batch.productId;
    batchId = batch.id;
  } else {
    throw new Error('QR token must reference a Product or Batch');
  }
  
  // 2. Determine experience mode (from data, product default, or MACRO fallback)
  let experienceMode: ExperienceMode;
  if (data.experienceMode) {
    experienceMode = data.experienceMode;
  } else {
    // Get product to check defaultExperienceMode
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { defaultExperienceMode: true }
    });
    experienceMode = product?.defaultExperienceMode || 'MACRO';
  }
  
  // 3. Get active prediction profile for the determined mode
  const predictionProfile = await getActivePrediction(productId, experienceMode);
  
  // 4. Generate device hash and get geo context
  const deviceHash = await getOrCreateSessionCookie(request);
  const geo = getGeoContext(request);
  
  // 5. Log device action
  await logDeviceAction(deviceHash, qrToken.id, 'survey_submit');
  
  // 6. Detect integrity patterns
  const integrityPattern = await detectIntegrityPatterns(deviceHash, qrToken.id);
  
  // 7. Detect content flags
  const contentFlags = detectContentFlags(data.note);
  
  // 8. Calculate completion metrics
  const completion = calculateCompletion(data);
  
  // 9. Create review
  const review = await prisma.experienceReview.create({
    data: {
      qrTokenId: qrToken.id,
      productId,
      batchId,
      predictionProfileId: predictionProfile?.id || null,
      experienceMode,
      reviewSource: 'transparency_page',
      overallMatch: data.overallMatch ?? null,
      deltaTranscend: data.deltas?.transcend ?? null,
      deltaEnergize: data.deltas?.energize ?? null,
      deltaCreate: data.deltas?.create ?? null,
      deltaTransform: data.deltas?.transform ?? null,
      deltaConnect: data.deltas?.connect ?? null,
      isFirstTime: data.context?.isFirstTime ?? null,
      doseBandGrams: data.context?.doseBandGrams ?? null,
      doseRelative: data.context?.doseRelative ?? null,
      setting: data.context?.setting ?? null,
      note: data.note ? data.note.substring(0, 500) : null, // Cap at 500 chars
      deviceHash,
      geoCountry: geo.country || null,
      geoRegion: geo.region || null,
      integrityFlags: integrityPattern.context.length > 0 && integrityPattern.context[0] !== 'clean' 
        ? { context: integrityPattern.context, severity: integrityPattern.severity }
        : Prisma.JsonNull,
      contentFlags: contentFlags.spam || contentFlags.profanity || contentFlags.hasUrl
        ? contentFlags
        : Prisma.JsonNull,
      questionsAnswered: completion.questionsAnswered,
      questionsSkipped: completion.questionsSkipped,
      completionRate: completion.completionRate
    }
  });
  
  return { reviewId: review.id };
}

/**
 * Get review statistics for dashboard
 */
export async function getReviewStats(): Promise<ReviewStats> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Total reviews
  const total = await prisma.experienceReview.count();
  
  // Weekly submissions
  const weeklySubmissions = await prisma.experienceReview.count({
    where: {
      createdAt: { gte: weekAgo }
    }
  });
  
  // Completion metrics
  const reviewsWithCompletion = await prisma.experienceReview.findMany({
    select: {
      questionsAnswered: true,
      questionsSkipped: true,
      completionRate: true,
      overallMatch: true,
      integrityFlags: true
    }
  });
  
  const totalQuestions = reviewsWithCompletion.reduce((sum, r) => sum + r.questionsAnswered + r.questionsSkipped, 0);
  const answeredQuestions = reviewsWithCompletion.reduce((sum, r) => sum + r.questionsAnswered, 0);
  const completionRate = totalQuestions > 0 ? answeredQuestions / totalQuestions : 0;
  const skipRate = 1 - completionRate;
  
  // Neutral rate (overallMatch = 2, or all deltas = 0)
  const neutralCount = reviewsWithCompletion.filter(r => {
    if (r.overallMatch === 2) return true;
    // Could also check if all deltas are 0, but that's more complex
    return false;
  }).length;
  const neutralRate = total > 0 ? neutralCount / total : 0;
  
  // Integrity breakdown
  const flaggedCount = reviewsWithCompletion.filter(r => {
    if (!r.integrityFlags) return false;
    const flags = r.integrityFlags as { context?: string[] };
    return flags.context && flags.context.length > 0 && flags.context[0] !== 'clean';
  }).length;
  
  // Goal progress (from SystemConfig)
  const goalConfig = await prisma.systemConfig.findUnique({
    where: { key: 'TRIPDAR_REVIEW_GOAL_GLOBAL' }
  });
  const target = goalConfig ? parseInt(goalConfig.value, 10) : 1000;
  
  // By mode breakdown
  const microTotal = await prisma.experienceReview.count({
    where: { experienceMode: 'MICRO' }
  });
  const macroTotal = await prisma.experienceReview.count({
    where: { experienceMode: 'MACRO' }
  });
  const microWeekly = await prisma.experienceReview.count({
    where: { experienceMode: 'MICRO', createdAt: { gte: weekAgo } }
  });
  const macroWeekly = await prisma.experienceReview.count({
    where: { experienceMode: 'MACRO', createdAt: { gte: weekAgo } }
  });
  
  return {
    total,
    weeklySubmissions,
    completionRate,
    skipRate,
    neutralRate,
    integrityBreakdown: {
      clean: total - flaggedCount,
      flagged: flaggedCount
    },
    goalProgress: {
      current: total,
      target
    },
    byMode: {
      MICRO: {
        total: microTotal,
        weeklySubmissions: microWeekly
      },
      MACRO: {
        total: macroTotal,
        weeklySubmissions: macroWeekly
      }
    }
  };
}

/**
 * Get reviews for export (ML-ready data)
 */
export async function getReviewsForExport(filters?: {
  productId?: string;
  batchId?: string;
  experienceMode?: string;
  from?: Date;
  to?: Date;
  flagged?: boolean;
}) {
  const where: any = {};
  
  if (filters?.productId) {
    where.productId = filters.productId;
  }
  
  if (filters?.batchId) {
    where.batchId = filters.batchId;
  }
  
  if (filters?.experienceMode) {
    where.experienceMode = filters.experienceMode;
  }
  
  if (filters?.from || filters?.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lte = filters.to;
  }
  
  if (filters?.flagged !== undefined) {
    if (filters.flagged) {
      where.integrityFlags = { not: null };
    } else {
      where.integrityFlags = null;
    }
  }
  
  return await prisma.experienceReview.findMany({
    where,
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true
        }
      },
      batch: {
        select: {
          id: true,
          batchCode: true
        }
      },
      predictionProfile: {
        select: {
          id: true,
          transcend: true,
          energize: true,
          create: true,
          transform: true,
          connect: true,
          vocabVersion: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
}


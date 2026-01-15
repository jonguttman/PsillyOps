// Device Integrity Service
// Server-side device hash generation and integrity pattern detection

import { prisma } from '@/lib/db/prisma';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'tripdar_session';
const COOKIE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const TIMESTAMP_BUCKET_MS = 60 * 60 * 1000; // 1 hour buckets

// Integrity thresholds (configurable via SystemConfig)
const DEFAULT_THRESHOLDS = {
  // Same barcode repeat
  repeatScan: {
    shortWindow: { count: 3, minutes: 10 },
    longWindow: { count: 6, hours: 2 }
  },
  // Multi-token window
  multiToken: {
    shortWindow: { count: 5, minutes: 10 },
    longWindow: { count: 12, hours: 2 }
  },
  // Survey flooding
  surveyFlooding: {
    shortWindow: { count: 3, minutes: 15 },
    longWindow: { count: 8, hours: 24 }
  }
};

export interface IntegrityPattern {
  context: string[];
  severity: 'low' | 'medium' | 'high';
}

/**
 * Generate a server-side device hash from request headers
 * Hash is derived from IP + User-Agent + timestamp bucket
 * This ensures privacy while maintaining session continuity
 */
export function generateDeviceHash(request: NextRequest): string {
  // Get IP address (respects X-Forwarded-For for proxies)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             'unknown';
  
  // Get User-Agent
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // Get timestamp bucket (round to nearest hour for privacy)
  const now = Date.now();
  const bucket = Math.floor(now / TIMESTAMP_BUCKET_MS) * TIMESTAMP_BUCKET_MS;
  
  // Create hash (SHA-256 of combined inputs)
  const input = `${ip}:${userAgent}:${bucket}`;
  const hash = createHash('sha256').update(input).digest('hex');
  
  // Return first 16 characters (sufficient for uniqueness, not reversible)
  return hash.substring(0, 16);
}

/**
 * Get or create a session cookie for device hash continuity
 * Returns the device hash (either from cookie or newly generated)
 */
export async function getOrCreateSessionCookie(request: NextRequest): Promise<string> {
  const cookieStore = await cookies();
  const existingCookie = cookieStore.get(COOKIE_NAME);
  
  // Check if cookie exists and is valid
  if (existingCookie?.value) {
    const cookieData = JSON.parse(existingCookie.value);
    const expiresAt = cookieData.expiresAt;
    
    // If cookie is still valid, return stored hash
    if (expiresAt && new Date(expiresAt) > new Date()) {
      return cookieData.deviceHash;
    }
  }
  
  // Generate new device hash
  const deviceHash = generateDeviceHash(request);
  
  // Create new cookie (will be set in response via Set-Cookie header)
  const expiresAt = new Date(Date.now() + COOKIE_TTL_MS);
  const cookieValue = JSON.stringify({
    deviceHash,
    expiresAt: expiresAt.toISOString()
  });
  
  // Note: In Next.js App Router, we return the cookie data
  // The API route handler will set the cookie via response headers
  return deviceHash;
}

/**
 * Log a device action (scan, survey_start, survey_submit)
 */
export async function logDeviceAction(
  deviceHash: string,
  tokenId: string | null,
  action: 'scan' | 'survey_start' | 'survey_submit'
): Promise<void> {
  await prisma.deviceScanLog.create({
    data: {
      deviceHash,
      tokenId: tokenId || null,
      action
    }
  });
}

/**
 * Detect integrity patterns for a device hash and token
 * Returns annotations for storage in review (never blocks)
 */
export async function detectIntegrityPatterns(
  deviceHash: string,
  tokenId: string | null
): Promise<IntegrityPattern> {
  const context: string[] = [];
  let severity: 'low' | 'medium' | 'high' = 'low';
  
  const now = new Date();
  
  // Check 1: Same barcode repeat
  if (tokenId) {
    const shortWindow = new Date(now.getTime() - DEFAULT_THRESHOLDS.repeatScan.shortWindow.minutes * 60 * 1000);
    const longWindow = new Date(now.getTime() - DEFAULT_THRESHOLDS.repeatScan.longWindow.hours * 60 * 60 * 1000);
    
    const shortCount = await prisma.deviceScanLog.count({
      where: {
        deviceHash,
        tokenId,
        action: 'scan',
        createdAt: { gte: shortWindow }
      }
    });
    
    const longCount = await prisma.deviceScanLog.count({
      where: {
        deviceHash,
        tokenId,
        action: 'scan',
        createdAt: { gte: longWindow }
      }
    });
    
    if (shortCount >= DEFAULT_THRESHOLDS.repeatScan.shortWindow.count) {
      context.push('rapid_repeat');
      severity = 'medium';
    } else if (longCount >= DEFAULT_THRESHOLDS.repeatScan.longWindow.count) {
      context.push('repeat_scan');
      severity = 'low';
    }
  }
  
  // Check 2: Multi-token window (many different barcodes)
  const shortWindow = new Date(now.getTime() - DEFAULT_THRESHOLDS.multiToken.shortWindow.minutes * 60 * 1000);
  const longWindow = new Date(now.getTime() - DEFAULT_THRESHOLDS.multiToken.longWindow.hours * 60 * 60 * 1000);
  
  const shortDistinct = await prisma.deviceScanLog.findMany({
    where: {
      deviceHash,
      action: 'scan',
      createdAt: { gte: shortWindow },
      tokenId: { not: null }
    },
    select: { tokenId: true },
    distinct: ['tokenId']
  });
  
  const longDistinct = await prisma.deviceScanLog.findMany({
    where: {
      deviceHash,
      action: 'scan',
      createdAt: { gte: longWindow },
      tokenId: { not: null }
    },
    select: { tokenId: true },
    distinct: ['tokenId']
  });
  
  if (shortDistinct.length >= DEFAULT_THRESHOLDS.multiToken.shortWindow.count) {
    context.push('multi_token_window');
    severity = severity === 'low' ? 'medium' : 'high';
  } else if (longDistinct.length >= DEFAULT_THRESHOLDS.multiToken.longWindow.count) {
    context.push('multi_token_extended');
    if (severity === 'low') severity = 'low';
  }
  
  // Check 3: Survey flooding (rapid submissions)
  const surveyShortWindow = new Date(now.getTime() - DEFAULT_THRESHOLDS.surveyFlooding.shortWindow.minutes * 60 * 1000);
  const surveyLongWindow = new Date(now.getTime() - DEFAULT_THRESHOLDS.surveyFlooding.longWindow.hours * 60 * 60 * 1000);
  
  const surveyShortCount = await prisma.deviceScanLog.count({
    where: {
      deviceHash,
      action: 'survey_submit',
      createdAt: { gte: surveyShortWindow }
    }
  });
  
  const surveyLongCount = await prisma.deviceScanLog.count({
    where: {
      deviceHash,
      action: 'survey_submit',
      createdAt: { gte: surveyLongWindow }
    }
  });
  
  if (surveyShortCount >= DEFAULT_THRESHOLDS.surveyFlooding.shortWindow.count) {
    context.push('survey_flooding');
    severity = 'high';
  } else if (surveyLongCount >= DEFAULT_THRESHOLDS.surveyFlooding.longWindow.count) {
    context.push('survey_volume');
    if (severity === 'low') severity = 'medium';
  }
  
  return {
    context: context.length > 0 ? context : ['clean'],
    severity
  };
}

/**
 * Get geo context from request (country and region only)
 */
export function getGeoContext(request: NextRequest): { country?: string; region?: string } {
  // In production, use a geo-IP service or Cloudflare headers
  // For now, return empty (can be enhanced later)
  const country = request.headers.get('cf-ipcountry') || 
                  request.headers.get('x-vercel-ip-country') || 
                  undefined;
  
  const region = request.headers.get('cf-region') || 
                 request.headers.get('x-vercel-ip-region') || 
                 undefined;
  
  return { country, region };
}


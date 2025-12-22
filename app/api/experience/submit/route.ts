// Public API route for submitting experience reviews
// No authentication required - anonymous feedback

import { NextRequest, NextResponse } from 'next/server';
import { submitReview } from '@/lib/services/experienceService';
import { getOrCreateSessionCookie } from '@/lib/services/deviceIntegrityService';
import { z } from 'zod';

const COOKIE_NAME = 'tripdar_session';
const COOKIE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

// Validation schema
const submitReviewSchema = z.object({
  token: z.string().min(1),
  overallMatch: z.number().int().min(0).max(4).nullable().optional(),
  deltas: z.object({
    transcend: z.number().int().min(-2).max(2).nullable().optional(),
    energize: z.number().int().min(-2).max(2).nullable().optional(),
    create: z.number().int().min(-2).max(2).nullable().optional(),
    transform: z.number().int().min(-2).max(2).nullable().optional(),
    connect: z.number().int().min(-2).max(2).nullable().optional(),
  }).optional(),
  context: z.object({
    isFirstTime: z.boolean().nullable().optional(),
    doseBandGrams: z.string().nullable().optional(),
    doseRelative: z.string().nullable().optional(),
    setting: z.string().nullable().optional(),
  }).optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Parse and validate request body
    const body = await req.json();
    const validated = submitReviewSchema.parse(body);
    
    // Submit review (this generates device hash internally)
    const result = await submitReview(validated, req);
    
    // Get device hash for cookie (reuse the one generated in submitReview)
    const deviceHash = await getOrCreateSessionCookie(req);
    
    // Create response
    const response = NextResponse.json({
      success: true,
      reviewId: result.reviewId
    });
    
    // Set session cookie (httpOnly, secure in production, 48h TTL)
    const expiresAt = new Date(Date.now() + COOKIE_TTL_MS);
    response.cookies.set(COOKIE_NAME, JSON.stringify({
      deviceHash,
      expiresAt: expiresAt.toISOString()
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/'
    });
    
    return response;
  } catch (error) {
    console.error('[Experience Submit] Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid request data',
          details: error.errors 
        },
        { status: 400 }
      );
    }
    
    if (error instanceof Error) {
      return NextResponse.json(
        { 
          success: false, 
          error: error.message 
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'An unexpected error occurred' 
      },
      { status: 500 }
    );
  }
}


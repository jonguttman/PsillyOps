/**
 * Seal Tuner Scan Notify API
 * 
 * Called when a tuner preview seal is scanned.
 * Adds the scan event to the queue for SSE broadcast.
 * 
 * This endpoint is PUBLIC (no auth required) because it's called
 * from the /seal/[token] page which is a public verification page.
 * However, it only accepts TUNER_PREVIEW tokens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isTunerToken } from '@/lib/types/sealConfig';
import { addScanEvent } from '../scan-events/route';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, userAgent } = body as {
      token: string;
      userAgent?: string;
    };
    
    if (!token) {
      return NextResponse.json(
        { error: 'Missing token' },
        { status: 400 }
      );
    }
    
    // Only accept tuner preview tokens
    if (!isTunerToken(token)) {
      return NextResponse.json(
        { error: 'Not a tuner token' },
        { status: 400 }
      );
    }
    
    // Add scan event
    addScanEvent({
      timestamp: new Date().toISOString(),
      token,
      userAgent,
      success: true,
    });
    
    return NextResponse.json({ 
      success: true,
      message: 'Scan recorded',
    });
    
  } catch (error) {
    console.error('[Scan Notify] Error:', error);
    return NextResponse.json(
      { error: 'Failed to record scan' },
      { status: 500 }
    );
  }
}


/**
 * Seal Tuner Preview API
 * 
 * Generates a preview SVG for the seal tuner UI using a fixed test token.
 * 
 * CRITICAL: This endpoint is for CALIBRATION ONLY.
 * - Uses TUNER_PREVIEW_001 token (never touches database)
 * - Accepts full SporeFieldConfig in request body
 * - Returns SVG directly for live preview
 * - Does NOT create or modify any tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { generateSealSvg } from '@/lib/services/sealGeneratorService';
import { SEAL_VERSION } from '@/lib/constants/seal';
import { TUNER_PREVIEW_TOKEN, isTunerToken } from '@/lib/types/sealConfig';
import type { SporeFieldConfig } from '@/lib/types/sealConfig';
import { validateConfig } from '@/lib/constants/sealPresets';

export async function POST(request: NextRequest) {
  try {
    // Require authentication (ADMIN or WAREHOUSE)
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userRole = session.user.role;
    if (userRole !== 'ADMIN' && userRole !== 'WAREHOUSE') {
      return NextResponse.json(
        { error: 'Forbidden: ADMIN or WAREHOUSE role required' },
        { status: 403 }
      );
    }
    
    // Parse config from request body
    const body = await request.json();
    const config = body.config as SporeFieldConfig;
    
    if (!config) {
      return NextResponse.json(
        { error: 'Missing config in request body' },
        { status: 400 }
      );
    }
    
    // Validate config
    const errors = validateConfig(config);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Invalid config', details: errors },
        { status: 400 }
      );
    }
    
    // CRITICAL: Always use the tuner preview token
    // This ensures we never accidentally create or modify real tokens
    const token = TUNER_PREVIEW_TOKEN;
    
    if (!isTunerToken(token)) {
      return NextResponse.json(
        { error: 'Internal error: Invalid tuner token' },
        { status: 500 }
      );
    }
    
    // Generate preview SVG with the provided config
    const svg = await generateSealSvg(token, SEAL_VERSION, config);
    
    // Return SVG directly
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store', // Never cache previews
      },
    });
    
  } catch (error) {
    console.error('[Tuner Preview] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for simple preview with default config
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userRole = session.user.role;
    if (userRole !== 'ADMIN' && userRole !== 'WAREHOUSE') {
      return NextResponse.json(
        { error: 'Forbidden: ADMIN or WAREHOUSE role required' },
        { status: 403 }
      );
    }
    
    // Check for preset query param
    const { searchParams } = new URL(request.url);
    const presetId = searchParams.get('preset');
    
    let config: SporeFieldConfig | undefined;
    
    if (presetId) {
      // Import preset definitions
      const { PRESET_DEFINITIONS } = await import('@/lib/constants/sealPresets');
      const preset = PRESET_DEFINITIONS[presetId as keyof typeof PRESET_DEFINITIONS];
      
      if (preset) {
        config = preset.defaults;
      }
    }
    
    // Generate preview SVG
    const svg = await generateSealSvg(TUNER_PREVIEW_TOKEN, SEAL_VERSION, config);
    
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store',
      },
    });
    
  } catch (error) {
    console.error('[Tuner Preview GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview' },
      { status: 500 }
    );
  }
}

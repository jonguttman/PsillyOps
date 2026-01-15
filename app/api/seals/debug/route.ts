/**
 * Seal Debug API
 * 
 * GET /api/seals/debug?token=xxx
 * 
 * Returns a debug SVG with zone boundaries and finder masks visualized.
 * NOT for production use - only for development/testing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { QR_CLOUD_EFFECTIVE_RADIUS, SEAL_VERSION } from '@/lib/constants/seal';
import { renderDotBasedQr } from '@/lib/services/sealQrRenderer';

// Zone boundaries (relative to QR radius)
const ZONE_A_END = 0.40;
const ZONE_B_END = 0.70;
const FINDER_MASK_MULTIPLIER = 1.25;

export async function GET(request: NextRequest) {
  try {
    // Authentication required
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only ADMIN can access debug
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'ADMIN role required for debug mode' },
        { status: 403 }
      );
    }

    // Get token from query
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') || 'debug_test_token';

    // Generate QR to get geometry
    const qrResult = await renderDotBasedQr(token, QR_CLOUD_EFFECTIVE_RADIUS);
    const { geometry } = qrResult;

    // Build debug SVG with zone overlays
    const centerX = geometry.centerX;
    const centerY = geometry.centerY;
    const qrRadius = geometry.radius;

    // Zone radii
    const zoneARadius = qrRadius * ZONE_A_END;
    const zoneBRadius = qrRadius * ZONE_B_END;
    const zoneCRadius = qrRadius * 1.1; // Show slightly beyond QR

    // Finder exclusion zones
    const finderCircles = geometry.finders.map((f, i) => {
      const exclusionRadius = f.outerRadius * FINDER_MASK_MULTIPLIER;
      return `
        <!-- Finder ${i + 1} exclusion zone -->
        <circle 
          cx="${f.centerX}" 
          cy="${f.centerY}" 
          r="${exclusionRadius}" 
          fill="rgba(255,0,0,0.2)" 
          stroke="red" 
          stroke-width="2"
          stroke-dasharray="5,5"
        />
        <circle 
          cx="${f.centerX}" 
          cy="${f.centerY}" 
          r="${f.outerRadius}" 
          fill="none" 
          stroke="red" 
          stroke-width="1"
        />
        <text 
          x="${f.centerX}" 
          y="${f.centerY - f.outerRadius - 10}" 
          text-anchor="middle" 
          font-size="12" 
          fill="red"
        >Finder ${i + 1}</text>
      `;
    }).join('\n');

    const debugSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <title>TripDAR Seal Debug - Zone Visualization</title>
  
  <!-- Background -->
  <rect width="1000" height="1000" fill="#f5f5f5"/>
  
  <!-- Outer radar boundary -->
  <circle cx="${centerX}" cy="${centerY}" r="485" fill="none" stroke="#ccc" stroke-width="2"/>
  
  <!-- Zone C (full density) - outer area -->
  <circle 
    cx="${centerX}" 
    cy="${centerY}" 
    r="${zoneCRadius}" 
    fill="rgba(0,255,0,0.1)" 
    stroke="green" 
    stroke-width="2"
  />
  <text x="${centerX + zoneCRadius + 10}" y="${centerY}" font-size="14" fill="green">Zone C (full)</text>
  
  <!-- Zone B (transition) -->
  <circle 
    cx="${centerX}" 
    cy="${centerY}" 
    r="${zoneBRadius}" 
    fill="rgba(255,255,0,0.15)" 
    stroke="orange" 
    stroke-width="2"
  />
  <text x="${centerX + zoneBRadius + 10}" y="${centerY + 20}" font-size="14" fill="orange">Zone B (40-70%)</text>
  
  <!-- Zone A (no spores) -->
  <circle 
    cx="${centerX}" 
    cy="${centerY}" 
    r="${zoneARadius}" 
    fill="rgba(255,0,0,0.1)" 
    stroke="red" 
    stroke-width="2"
  />
  <text x="${centerX + zoneARadius + 10}" y="${centerY + 40}" font-size="14" fill="red">Zone A (0-40%)</text>
  
  <!-- QR boundary -->
  <circle 
    cx="${centerX}" 
    cy="${centerY}" 
    r="${qrRadius}" 
    fill="none" 
    stroke="blue" 
    stroke-width="3"
    stroke-dasharray="10,5"
  />
  <text x="${centerX}" y="${centerY - qrRadius - 15}" text-anchor="middle" font-size="16" fill="blue" font-weight="bold">QR Radius: ${qrRadius}</text>
  
  <!-- Finder exclusion zones -->
  ${finderCircles}
  
  <!-- QR code (actual) -->
  ${qrResult.svg}
  
  <!-- Legend -->
  <g transform="translate(20, 900)">
    <rect x="0" y="0" width="960" height="80" fill="white" stroke="#ccc" rx="5"/>
    <text x="10" y="25" font-size="14" font-weight="bold">Debug Legend:</text>
    <text x="10" y="50" font-size="12">
      <tspan fill="red">■ Zone A (0-40%): No spores</tspan>
      <tspan dx="20" fill="orange">■ Zone B (40-70%): Light spores</tspan>
      <tspan dx="20" fill="green">■ Zone C (70%+): Full density</tspan>
      <tspan dx="20" fill="red">⊙ Finder masks (1.25×)</tspan>
    </text>
    <text x="10" y="70" font-size="11" fill="#666">Token: ${token.substring(0, 20)}... | QR Radius: ${qrRadius} SVG units | Version: ${SEAL_VERSION}</text>
  </g>
</svg>`;

    return new NextResponse(debugSvg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[Seal Debug] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Debug generation failed' },
      { status: 500 }
    );
  }
}


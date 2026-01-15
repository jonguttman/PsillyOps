/**
 * Radar Sweep Overlay Service
 * 
 * Loads and prepares the RadarSweep.svg for injection into seals.
 * 
 * RadarSweep overlay is decorative only.
 * It must NEVER:
 * - Alter QR geometry
 * - Mask QR modules
 * - Affect scan reliability
 */

import * as fs from 'fs';
import * as path from 'path';
import { SEAL_QR_RADIUS, INNER_RADAR_DIAMETER } from '@/lib/constants/seal';

// Safety buffer in SVG units to account for stroke widths and renderer variance
const SAFETY_BUFFER = 6;

// Inner radar radius (half of diameter)
const INNER_RADAR_RADIUS = INNER_RADAR_DIAMETER / 2;

/**
 * Calculate the safe annular region for the radar sweep overlay.
 * 
 * The overlay is clipped to this donut-shaped region to ensure
 * it never interferes with QR scanning.
 */
export function getSweepSafeZone(): { innerRadius: number; outerRadius: number } {
  // Inner boundary: just outside the QR quiet zone
  const safeInnerRadius = SEAL_QR_RADIUS * 1.05 + SAFETY_BUFFER;
  
  // Outer boundary: just inside the inner radar edge
  const safeOuterRadius = INNER_RADAR_RADIUS * 0.95 - SAFETY_BUFFER;
  
  return {
    innerRadius: safeInnerRadius,
    outerRadius: safeOuterRadius,
  };
}

/**
 * Generate the SVG clip path for the radar sweep overlay.
 * 
 * Uses evenodd fill rule to create a donut-shaped clip region.
 */
export function generateSweepClipPath(): string {
  const { innerRadius, outerRadius } = getSweepSafeZone();
  
  // Create two concentric circles using arc commands
  // The evenodd fill rule creates a donut (outer minus inner)
  const clipPath = `
    <clipPath id="radarSweepClip">
      <path
        fill-rule="evenodd"
        d="
          M 500,${500 - outerRadius}
          a ${outerRadius},${outerRadius} 0 1,0 0,${outerRadius * 2}
          a ${outerRadius},${outerRadius} 0 1,0 0,${-outerRadius * 2}
          M 500,${500 - innerRadius}
          a ${innerRadius},${innerRadius} 0 1,0 0,${innerRadius * 2}
          a ${innerRadius},${innerRadius} 0 1,0 0,${-innerRadius * 2}
        "
      />
    </clipPath>
  `;
  
  return clipPath;
}

/**
 * Load the RadarSweep.svg file and prepare it for injection.
 * 
 * The SVG is loaded as-is (no rasterization) and modified to:
 * - Use currentColor for fills and strokes
 * - Remove hardcoded colors
 */
export function loadRadarSweepSvg(): string {
  const filePath = path.join(process.cwd(), 'public/svg/RadarSweep.svg');
  
  let svgContent = fs.readFileSync(filePath, 'utf8');
  
  // Remove the outer <svg> wrapper - we'll wrap it ourselves
  svgContent = svgContent
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>/, '');
  
  // Replace hardcoded #fff with currentColor for both fill and stroke
  svgContent = svgContent
    .replace(/fill:#fff/g, 'fill:currentColor')
    .replace(/stroke:#fff/g, 'stroke:currentColor')
    .replace(/fill="#fff"/g, 'fill="currentColor"')
    .replace(/stroke="#fff"/g, 'stroke="currentColor"');
  
  return svgContent;
}

/**
 * Generate the complete radar sweep overlay group.
 * 
 * @param color - Hex color for the sweep
 * @param opacity - Opacity (0-1)
 * @param rotation - Rotation in degrees
 */
export function generateRadarSweepOverlay(
  color: string,
  opacity: number,
  rotation: number
): string {
  const sweepContent = loadRadarSweepSvg();
  
  // The sweep SVG is already centered at 500,500 via its internal transform
  // We apply rotation around the center
  const overlay = `
    <g
      id="radar-sweep-overlay"
      clip-path="url(#radarSweepClip)"
      transform="rotate(${rotation} 500 500)"
      opacity="${opacity}"
      style="color: ${color}; pointer-events: none;"
    >
      ${sweepContent}
    </g>
  `;
  
  return overlay;
}


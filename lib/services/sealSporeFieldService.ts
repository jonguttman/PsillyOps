/**
 * Seal Spore Field Service
 * 
 * Generates a deterministic, organic spore cloud for TripDAR seals using pure SVG.
 * This approach avoids native canvas dependencies for serverless compatibility.
 * 
 * VISUAL GOAL:
 * - Dense core that feels alive
 * - Mid-radius has motion and texture  
 * - Outer 10-15% feels airy and sparse
 * - No visible bands or math artifacts
 * - Looks like spores drifting outward, not a pattern
 * 
 * INVARIANTS:
 * - Same token + version = identical spore field forever
 * - Never affects QR code scanability
 * - Never overlaps text or outer ring
 * - Pure JavaScript, no native dependencies (serverless compatible)
 */

import { createHash } from 'crypto';
import { createNoise2D } from 'simplex-noise';

// SVG configuration (using 1000x1000 to match seal viewBox)
const SVG_SIZE = 1000;
const CENTER = SVG_SIZE / 2;
const MAX_RADIUS = SVG_SIZE * 0.485; // ~97% of radar area (expanded)

// Density configuration
const DENSITY_MULTIPLIER = 1.2; // Increased for denser coverage
const EDGE_TAPER_START = 0.92; // Only fade in outer 3-5%

// Dot configuration (scaled for SVG units)
const MIN_DOT_RADIUS = 0.8;
const MAX_DOT_RADIUS = 2.8; // Slightly larger for denser core
const MIN_OPACITY = 0.18;
const MAX_OPACITY = 0.92; // Higher max for solid core

// Noise configuration
const NOISE_SCALE = 0.006;

/**
 * Seeded pseudo-random number generator
 * Uses a simple but effective xorshift algorithm
 */
class SeededRandom {
  private state: number;

  constructor(seed: string) {
    // Convert seed string to a number
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    this.state = hash >>> 0 || 1; // Ensure non-zero
  }

  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return (this.state >>> 0) / 0xFFFFFFFF;
  }
}

/**
 * Compute deterministic seed from token and version
 */
function computeSeed(token: string, version: string): string {
  const input = `${token}|${version}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Smoothstep function for edge tapering
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Calculate base density using center-heavy curve with aggressive core boost
 * 
 * This produces:
 * - Very dense, nearly solid core
 * - Gradual organic falloff
 * - No visible QR bounding box edges
 */
function calculateBaseDensity(rNorm: number): number {
  // Base falloff curve (gentler than before)
  const base = Math.pow(Math.max(0, 1 - rNorm), 1.2);
  
  // Aggressive core boost - smoothstep from center outward
  // At r=0: coreBoost = 1.0, at r=0.28: coreBoost = 0.0
  const coreBoost = smoothstep(0.0, 0.28, 1 - rNorm);
  
  // Combine: base * (1 + coreBoost * 2.5) gives massive center density
  return base * (1 + coreBoost * 2.5);
}

/**
 * Generate the spore field as pure SVG (serverless compatible)
 * 
 * Uses deterministic noise and radial density to create organic spore pattern.
 * No native dependencies required.
 * 
 * @param token - The QR token for deterministic seeding
 * @param version - The seal version for deterministic seeding
 * @returns SVG group element string with spore dots, or null if generation fails
 */
export async function generateSporeFieldSvg(
  token: string,
  version: string
): Promise<{ svgContent: string; metadata: SporeFieldMetadata } | null> {
  try {
    const seed = computeSeed(token, version);
    const rng = new SeededRandom(seed);
    
    // Create seeded noise function
    // simplex-noise v4+ uses createNoise2D with a PRNG function
    const noise2D = createNoise2D(() => rng.next());
    
    // Generate spore field using point sampling
    // Increased sample count + biased sampling toward center for dense core
    const numSamples = 250000; // Increased for denser coverage
    const dots: string[] = [];
    
    for (let i = 0; i < numSamples; i++) {
      // Random position within SVG viewBox
      let x = rng.next() * SVG_SIZE;
      let y = rng.next() * SVG_SIZE;
      
      // Calculate distance from center
      let dx = x - CENTER;
      let dy = y - CENTER;
      let distance = Math.sqrt(dx * dx + dy * dy);
      
      // Normalized radius (0 = center, 1 = max radius)
      let rNorm = distance / MAX_RADIUS;
      
      // BIAS TOWARD CENTER: For inner region, add extra samples
      // This crushes the QR box outline with density
      if (rNorm < 0.4 && rng.next() < 0.6) {
        // 60% chance to resample closer to center when already in inner region
        const angle = rng.next() * Math.PI * 2;
        const biasedDistance = rng.next() * MAX_RADIUS * 0.35; // Concentrate in inner 35%
        x = CENTER + Math.cos(angle) * biasedDistance;
        y = CENTER + Math.sin(angle) * biasedDistance;
        dx = x - CENTER;
        dy = y - CENTER;
        distance = Math.sqrt(dx * dx + dy * dy);
        rNorm = distance / MAX_RADIUS;
      }
      
      // Skip if outside the field
      if (rNorm > 1.0) continue;
      
      // Calculate base density from center-heavy curve
      const baseDensity = calculateBaseDensity(rNorm);
      
      // Apply noise modulation for organic variation
      const noiseValue = noise2D(x * NOISE_SCALE, y * NOISE_SCALE);
      const noiseFactor = 0.65 + noiseValue * 0.35;
      
      let finalDensity = baseDensity * noiseFactor;
      
      // Apply edge taper only in outer 8% to avoid hard cutoff
      if (rNorm > EDGE_TAPER_START) {
        finalDensity *= smoothstep(1.0, EDGE_TAPER_START, rNorm);
      }
      
      // Probabilistic dot placement
      // NO QR quiet-zone masking - spores exist everywhere
      if (rng.next() < finalDensity * DENSITY_MULTIPLIER) {
        // Calculate dot properties
        const dotRadius = lerp(MAX_DOT_RADIUS, MIN_DOT_RADIUS, rNorm) * (0.7 + rng.next() * 0.6);
        const opacity = clamp(finalDensity * 0.9, MIN_OPACITY, MAX_OPACITY);
        
        // Add SVG circle element
        dots.push(
          `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotRadius.toFixed(2)}" fill="rgba(0,0,0,${opacity.toFixed(2)})"/>`
        );
      }
    }
    
    const svgContent = dots.join('\n      ');
    
    const metadata: SporeFieldMetadata = {
      version: 'v2',
      canvas: SVG_SIZE,
      densityCurve: 'base * (1 + coreBoost * 2.5)',
      noise: 'simplex',
      edgeTaper: true,
      samples: numSamples,
      tokenHash: seed.substring(0, 16),
      dotCount: dots.length,
    };
    
    return { svgContent, metadata };
  } catch (error) {
    console.error('[SporeField] Generation failed:', error);
    return null;
  }
}

/**
 * Metadata about the generated spore field
 */
export interface SporeFieldMetadata {
  version: string;
  canvas: number;
  densityCurve: string;
  noise: string;
  edgeTaper: boolean;
  samples: number;
  tokenHash: string;
  dotCount?: number;
}

/**
 * Wrap spore field SVG content in a group element
 * 
 * @param svgContent - The SVG circles content
 * @returns SVG group element string
 */
export function createSporeFieldSvgElement(
  svgContent: string
): string {
  return `<g id="spore-field">
      ${svgContent}
    </g>`;
}

/**
 * Generate legacy SVG dots as fallback
 * This matches the old microfiber dots behavior for graceful degradation
 */
export function generateFallbackSvgDots(
  token: string,
  version: string,
  radius: number,
  centerX: number = 500,
  centerY: number = 500
): string {
  const seed = computeSeed(token, version);
  const hashBytes = Buffer.from(seed, 'hex');
  const dots: string[] = [];
  
  // Generate dots deterministically from hash
  const numDots = 150; // More dots than before for better coverage
  for (let i = 0; i < numDots && i * 2 + 1 < hashBytes.length; i++) {
    const xByte = hashBytes[i * 2];
    const yByte = hashBytes[i * 2 + 1];
    
    // Use polar coordinates for distribution
    const angle = (xByte / 255) * Math.PI * 2;
    const distance = Math.pow(yByte / 255, 0.6) * radius * 0.9; // Power curve for center density
    
    const cx = centerX + Math.cos(angle) * distance;
    const cy = centerY + Math.sin(angle) * distance;
    
    // Vary dot size based on distance
    const rNorm = distance / radius;
    const dotR = lerp(3, 1, rNorm) * (0.8 + ((xByte + yByte) % 40) / 100);
    const opacity = lerp(0.4, 0.15, rNorm);
    
    dots.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${dotR.toFixed(1)}" fill="rgba(0,0,0,${opacity.toFixed(2)})"/>`
    );
  }
  
  return dots.join('\n      ');
}


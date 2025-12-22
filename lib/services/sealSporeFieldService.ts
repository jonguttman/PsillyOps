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
const MAX_RADIUS = SVG_SIZE * 0.45; // ~90% of radar area

// Density configuration
const DENSITY_MULTIPLIER = 0.9;
const EDGE_TAPER_START = 0.92;

// Dot configuration (scaled for SVG units)
const MIN_DOT_RADIUS = 0.8;
const MAX_DOT_RADIUS = 2.5;
const MIN_OPACITY = 0.15;
const MAX_OPACITY = 0.85;

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
 * Calculate base density using non-linear falloff
 * pow(1 - r, 1.8) gives:
 * - High density in inner ~50%
 * - Smooth mid-zone texture
 * - Long, gentle taper near edge
 */
function calculateBaseDensity(rNorm: number): number {
  return Math.pow(Math.max(0, 1 - rNorm), 1.8);
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
    // We sample candidate points and probabilistically place dots
    const numSamples = 150000; // Adjusted for SVG (fewer samples needed at lower resolution)
    const dots: string[] = [];
    
    for (let i = 0; i < numSamples; i++) {
      // Random position within SVG viewBox
      const x = rng.next() * SVG_SIZE;
      const y = rng.next() * SVG_SIZE;
      
      // Calculate distance from center
      const dx = x - CENTER;
      const dy = y - CENTER;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Normalized radius (0 = center, 1 = max radius)
      const rNorm = distance / MAX_RADIUS;
      
      // Skip if outside the field
      if (rNorm > 1.0) continue;
      
      // Calculate base density from radial curve
      const baseDensity = calculateBaseDensity(rNorm);
      
      // Apply noise modulation for organic variation
      const noiseValue = noise2D(x * NOISE_SCALE, y * NOISE_SCALE);
      const noiseFactor = 0.65 + noiseValue * 0.35;
      
      let finalDensity = baseDensity * noiseFactor;
      
      // Apply edge taper to avoid hard cutoff
      if (rNorm > EDGE_TAPER_START) {
        finalDensity *= smoothstep(1.0, EDGE_TAPER_START, rNorm);
      }
      
      // Probabilistic dot placement
      if (rng.next() < finalDensity * DENSITY_MULTIPLIER) {
        // Calculate dot properties
        const dotRadius = lerp(MAX_DOT_RADIUS, MIN_DOT_RADIUS, rNorm) * (0.7 + rng.next() * 0.6);
        const opacity = clamp(finalDensity, MIN_OPACITY, MAX_OPACITY);
        
        // Add SVG circle element
        dots.push(
          `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotRadius.toFixed(2)}" fill="rgba(0,0,0,${opacity.toFixed(2)})"/>`
        );
      }
    }
    
    const svgContent = dots.join('\n      ');
    
    const metadata: SporeFieldMetadata = {
      version: 'v1',
      canvas: SVG_SIZE,
      densityCurve: 'pow(1 - r, 1.8)',
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


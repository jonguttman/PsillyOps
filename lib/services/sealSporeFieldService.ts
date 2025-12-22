/**
 * Seal Spore Field Service
 * 
 * Generates a raster-first, radial noise spore cloud for TripDAR seals.
 * The spore field is purely decorative and provides organic, ink-like texture.
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
 * - Graceful fallback if canvas fails
 */

import { createHash } from 'crypto';
import { createCanvas } from '@napi-rs/canvas';
import { createNoise2D } from 'simplex-noise';

// Canvas configuration
const CANVAS_SIZE = 2048;
const CENTER = CANVAS_SIZE / 2;
const MAX_RADIUS = CANVAS_SIZE * 0.45; // ~90% of radar area

// Density configuration
const DENSITY_MULTIPLIER = 0.9;
const EDGE_TAPER_START = 0.92;

// Dot configuration
const MIN_DOT_RADIUS = 0.6;
const MAX_DOT_RADIUS = 1.4;
const MIN_OPACITY = 0.15;
const MAX_OPACITY = 0.85;

// Noise configuration
const NOISE_SCALE = 0.0025;

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
 * Generate the spore field as a transparent PNG buffer
 * 
 * @param token - The QR token for deterministic seeding
 * @param version - The seal version for deterministic seeding
 * @returns PNG buffer as base64 string, or null if generation fails
 */
export async function generateSporeFieldPng(
  token: string,
  version: string
): Promise<{ base64: string; metadata: SporeFieldMetadata } | null> {
  try {
    const seed = computeSeed(token, version);
    const rng = new SeededRandom(seed);
    
    // Create seeded noise function
    // simplex-noise v4+ uses createNoise2D with a PRNG function
    const noise2D = createNoise2D(() => rng.next());
    
    // Create canvas
    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');
    
    // Clear with transparency
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    
    // Generate spore field using point sampling
    // We sample candidate points and probabilistically place dots
    const numSamples = 800000; // High sample count for dense coverage
    
    for (let i = 0; i < numSamples; i++) {
      // Random position within canvas
      const x = rng.next() * CANVAS_SIZE;
      const y = rng.next() * CANVAS_SIZE;
      
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
        
        // Draw dot
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
        ctx.fill();
      }
    }
    
    // Convert to PNG buffer
    const pngBuffer = canvas.toBuffer('image/png');
    const base64 = pngBuffer.toString('base64');
    
    const metadata: SporeFieldMetadata = {
      version: 'v1',
      canvas: CANVAS_SIZE,
      densityCurve: 'pow(1 - r, 1.8)',
      noise: 'simplex',
      edgeTaper: true,
      samples: numSamples,
      tokenHash: seed.substring(0, 16),
    };
    
    return { base64, metadata };
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
}

/**
 * Generate SVG image element for embedding the spore field
 * 
 * @param base64Png - The base64-encoded PNG data
 * @param svgSize - The target size in SVG units (typically 1000 for the seal)
 * @returns SVG image element string
 */
export function createSporeFieldSvgElement(
  base64Png: string,
  svgSize: number = 1000
): string {
  // Calculate positioning to center the spore field
  // The spore field should align with the radar area
  const fieldSize = svgSize * 0.9; // 90% of SVG size
  const offset = (svgSize - fieldSize) / 2;
  
  return `<image 
    id="spore-field"
    x="${offset}" 
    y="${offset}" 
    width="${fieldSize}" 
    height="${fieldSize}"
    href="data:image/png;base64,${base64Png}"
    preserveAspectRatio="xMidYMid meet"
  />`;
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


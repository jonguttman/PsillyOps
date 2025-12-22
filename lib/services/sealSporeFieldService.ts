/**
 * Seal Spore Field Service
 * 
 * Generates a deterministic, organic spore cloud for TripDAR seals as a RASTER PNG.
 * 
 * CRITICAL: SVG cannot handle dense spore fields (node limit errors).
 * This service generates a single <image> element with base64 PNG data.
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
 * - Output is EXACTLY ONE SVG node (<image>)
 * - NO SVG FALLBACKS - if raster fails, render nothing
 */

import { createHash } from 'crypto';
import { createNoise2D } from 'simplex-noise';
import * as zlib from 'zlib';

// PNG configuration
const PNG_SIZE = 512; // Smaller for performance, will be scaled by SVG
const CENTER = PNG_SIZE / 2;
const MAX_RADIUS = PNG_SIZE * 0.485; // ~97% of radar area

// Density configuration
const DENSITY_MULTIPLIER = 1.2;
const EDGE_TAPER_START = 0.92;

// Dot configuration (in pixels)
const MIN_DOT_RADIUS = 0.4;
const MAX_DOT_RADIUS = 1.4;
const MIN_OPACITY = 0.18;
const MAX_OPACITY = 0.92;

// Noise configuration
const NOISE_SCALE = 0.012; // Adjusted for smaller canvas

/**
 * Seeded pseudo-random number generator
 */
class SeededRandom {
  private state: number;

  constructor(seed: string) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    this.state = hash >>> 0 || 1;
  }

  next(): number {
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
 */
function calculateBaseDensity(rNorm: number): number {
  const base = Math.pow(Math.max(0, 1 - rNorm), 1.2);
  const coreBoost = smoothstep(0.0, 0.28, 1 - rNorm);
  return base * (1 + coreBoost * 2.5);
}

/**
 * Create PNG file from raw RGBA pixel data
 * Pure JavaScript implementation - no native dependencies
 */
function createPngFromPixels(pixels: Uint8Array, width: number, height: number): Buffer {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(6, 9);  // color type (RGBA)
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace
  
  const ihdrChunk = createPngChunk('IHDR', ihdr);
  
  // IDAT chunk - pixel data with filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];     // R
      rawData[dstIdx + 1] = pixels[srcIdx + 1]; // G
      rawData[dstIdx + 2] = pixels[srcIdx + 2]; // B
      rawData[dstIdx + 3] = pixels[srcIdx + 3]; // A
    }
  }
  
  const compressed = zlib.deflateSync(rawData, { level: 6 });
  const idatChunk = createPngChunk('IDAT', compressed);
  
  // IEND chunk
  const iendChunk = createPngChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Create a PNG chunk with CRC
 */
function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

/**
 * CRC32 calculation for PNG
 */
function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  const table = getCrc32Table();
  
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  return crc ^ 0xFFFFFFFF;
}

let crc32Table: Uint32Array | null = null;

function getCrc32Table(): Uint32Array {
  if (crc32Table) return crc32Table;
  
  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
  }
  return crc32Table;
}

/**
 * Draw a filled circle on the pixel buffer with alpha blending
 */
function drawCircle(
  pixels: Uint8Array,
  width: number,
  cx: number,
  cy: number,
  radius: number,
  opacity: number
): void {
  const r = Math.ceil(radius);
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(width - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(width - 1, Math.ceil(cy + r));
  
  const alpha = Math.round(opacity * 255);
  
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist <= radius) {
        const idx = (y * width + x) * 4;
        // Alpha blend black dot onto transparent background
        const existingAlpha = pixels[idx + 3];
        const newAlpha = Math.min(255, existingAlpha + alpha * (1 - existingAlpha / 255));
        pixels[idx + 3] = newAlpha;
        // Keep RGB as 0 (black)
      }
    }
  }
}

/**
 * Generate the spore field as a base64 PNG
 * 
 * CRITICAL: Returns a single <image> element, NOT thousands of circles.
 * If generation fails, returns null - NO SVG FALLBACK.
 */
export async function generateSporeFieldPng(
  token: string,
  version: string
): Promise<{ base64: string; metadata: SporeFieldMetadata } | null> {
  try {
    const seed = computeSeed(token, version);
    const rng = new SeededRandom(seed);
    const noise2D = createNoise2D(() => rng.next());
    
    // Create RGBA pixel buffer (transparent black background)
    const pixels = new Uint8Array(PNG_SIZE * PNG_SIZE * 4);
    // Initialize to transparent (all zeros is already transparent black)
    
    // Generate spore field
    const numSamples = 80000; // Reduced for smaller canvas
    let dotCount = 0;
    
    for (let i = 0; i < numSamples; i++) {
      let x = rng.next() * PNG_SIZE;
      let y = rng.next() * PNG_SIZE;
      
      let dx = x - CENTER;
      let dy = y - CENTER;
      let distance = Math.sqrt(dx * dx + dy * dy);
      let rNorm = distance / MAX_RADIUS;
      
      // Bias toward center
      if (rNorm < 0.4 && rng.next() < 0.6) {
        const angle = rng.next() * Math.PI * 2;
        const biasedDistance = rng.next() * MAX_RADIUS * 0.35;
        x = CENTER + Math.cos(angle) * biasedDistance;
        y = CENTER + Math.sin(angle) * biasedDistance;
        dx = x - CENTER;
        dy = y - CENTER;
        distance = Math.sqrt(dx * dx + dy * dy);
        rNorm = distance / MAX_RADIUS;
      }
      
      if (rNorm > 1.0) continue;
      
      const baseDensity = calculateBaseDensity(rNorm);
      const noiseValue = noise2D(x * NOISE_SCALE, y * NOISE_SCALE);
      const noiseFactor = 0.65 + noiseValue * 0.35;
      let finalDensity = baseDensity * noiseFactor;
      
      if (rNorm > EDGE_TAPER_START) {
        finalDensity *= smoothstep(1.0, EDGE_TAPER_START, rNorm);
      }
      
      if (rng.next() < finalDensity * DENSITY_MULTIPLIER) {
        const dotRadius = lerp(MAX_DOT_RADIUS, MIN_DOT_RADIUS, rNorm) * (0.7 + rng.next() * 0.6);
        const opacity = clamp(finalDensity * 0.9, MIN_OPACITY, MAX_OPACITY);
        
        drawCircle(pixels, PNG_SIZE, x, y, dotRadius, opacity);
        dotCount++;
      }
    }
    
    // Create PNG
    const pngBuffer = createPngFromPixels(pixels, PNG_SIZE, PNG_SIZE);
    const base64 = pngBuffer.toString('base64');
    
    const metadata: SporeFieldMetadata = {
      version: 'v3-raster',
      canvas: PNG_SIZE,
      densityCurve: 'base * (1 + coreBoost * 2.5)',
      noise: 'simplex',
      edgeTaper: true,
      samples: numSamples,
      tokenHash: seed.substring(0, 16),
      dotCount,
    };
    
    return { base64, metadata };
  } catch (error) {
    console.error('[SporeField] PNG generation failed:', error);
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
 * Create the SVG <image> element for the spore field
 * 
 * CRITICAL: This returns EXACTLY ONE SVG node.
 */
export function createSporeFieldImageElement(base64Png: string): string {
  // Position to fill the radar area (centered at 500,500 in 1000x1000 viewBox)
  // The PNG covers the full spore field area
  const size = 970; // ~97% of 1000
  const offset = (1000 - size) / 2;
  
  return `<image id="spore-field" x="${offset}" y="${offset}" width="${size}" height="${size}" href="data:image/png;base64,${base64Png}" preserveAspectRatio="xMidYMid meet"/>`;
}

// ============================================
// DELETED: generateFallbackSvgDots
// DELETED: generateSporeFieldSvg
// DELETED: createSporeFieldSvgElement
// 
// SVG dot fallbacks are PERMANENTLY DISABLED.
// If raster fails, we render NO spore field.
// This is intentional to prevent SVG node limit errors.
// ============================================

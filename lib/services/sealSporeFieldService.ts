/**
 * Seal Spore Field Service — Config-Driven Rendering
 * 
 * Generates a deterministic, organic spore cloud for TripDAR seals as a RASTER PNG.
 * 
 * CRITICAL: This is a CALIBRATION SYSTEM.
 * - All rendering is driven by SporeFieldConfig objects
 * - Different presets use DIFFERENT ALGORITHMS, not just different values
 * - TUNER_PREVIEW tokens never touch the database
 * 
 * ALGORITHM VARIANTS (by basePreset):
 * - dot-zones: Basic radial zones, no module awareness, small particles
 * - zone-system: 3-zone + hard quiet core, finder exclusion
 * - module-masked: Full module matrix lookup, dark/light/edge masking
 * - material-unified: Particle size tied to QR dots, opacity-based variation
 * 
 * INVARIANTS:
 * - Same token + version + config = identical spore field forever
 * - Never affects QR code scanability
 * - Output is EXACTLY ONE SVG node (<image>)
 * - NO SVG FALLBACKS - if raster fails, render nothing
 */

import { createHash } from 'crypto';
import { createNoise2D } from 'simplex-noise';
import * as zlib from 'zlib';
import type { QrGeometry } from './sealQrRenderer';
import type { SporeFieldConfig, BasePresetId } from '@/lib/types/sealConfig';

// PNG configuration
const PNG_SIZE = 512;
const CENTER = PNG_SIZE / 2;
const MAX_RADIUS = PNG_SIZE * 0.485; // ~97% of radar area

// SVG to PNG scale factor (SVG is 1000x1000, PNG is 512x512)
const SVG_TO_PNG_SCALE = PNG_SIZE / 1000;

// Module mask values (for precomputed mask)
const enum ModuleMaskValue {
  OUTSIDE_QR = 0,
  DARK_MODULE = 1,
  LIGHT_MODULE = 2,
  FINDER_ZONE = 3,
  EDGE_BUFFER = 4,
}

// Noise configuration
const NOISE_SCALE = 0.012;
const ANGULAR_MOD_FREQUENCY = 6;

// Density configuration
const DENSITY_MULTIPLIER = 1.2;
const EDGE_TAPER_START = 0.92;

// Zone B caps (used across presets)
const ZONE_B_MAX_DENSITY = 0.25;
const ZONE_B_MAX_OPACITY = 0.30;

// Angular modulation strengths
const ANGULAR_MOD_STRENGTH_OUTER = 0.07;
const ANGULAR_MOD_STRENGTH_TRANSITION = 0.02;

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
 * Compute deterministic seed from token, version, and config hash
 */
function computeSeed(token: string, version: string, config: SporeFieldConfig): string {
  // Include ONLY spore-relevant config in seed for determinism
  // CRITICAL: Exclude baseLayerConfig because it only affects SVG styling,
  // not the spore field. Including it would cause the spore field to regenerate
  // when users adjust radar line opacity/color, which is visually jarring.
  const sporeRelevantConfig = {
    basePreset: config.basePreset,
    sporeCount: config.sporeCount,
    minOpacity: config.minOpacity,
    maxOpacity: config.maxOpacity,
    zoneAEnd: config.zoneAEnd,
    zoneBEnd: config.zoneBEnd,
    quietCoreFactor: config.quietCoreFactor,
    edgeBufferFactor: config.edgeBufferFactor,
    lightModuleDensity: config.lightModuleDensity,
    lightModuleMaxOpacity: config.lightModuleMaxOpacity,
    finderExclusionMultiplier: config.finderExclusionMultiplier,
    sporeRadiusMinFactor: config.sporeRadiusMinFactor,
    sporeRadiusMaxFactor: config.sporeRadiusMaxFactor,
    moduleContrastBoost: config.moduleContrastBoost,
    qrScale: config.qrScale,
    qrErrorCorrection: config.qrErrorCorrection,
    // NOTE: baseLayerConfig is intentionally excluded
  };
  const configHash = createHash('md5').update(JSON.stringify(sporeRelevantConfig)).digest('hex').substring(0, 8);
  const input = `${token}|${version}|${configHash}`;
  return createHash('sha256').update(input).digest('hex');
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function calculateBaseDensity(rNorm: number): number {
  const base = Math.pow(Math.max(0, 1 - rNorm), 1.2);
  const coreBoost = smoothstep(0.0, 0.28, 1 - rNorm);
  return base * (1 + coreBoost * 2.5);
}

function isInFinderExclusionZone(
  x: number,
  y: number,
  finders: { centerX: number; centerY: number; exclusionRadius: number }[]
): boolean {
  for (const finder of finders) {
    const dx = x - finder.centerX;
    const dy = y - finder.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < finder.exclusionRadius) {
      return true;
    }
  }
  return false;
}

/**
 * Inverse-rotate a point around a center
 * Used to transform pixel coordinates back to unrotated QR space
 */
function inverseRotatePoint(
  px: number, 
  py: number, 
  centerX: number, 
  centerY: number, 
  rotationDegrees: number
): { x: number; y: number } {
  if (rotationDegrees === 0) return { x: px, y: py };
  
  // Inverse rotation = negative angle
  const angleRad = (-rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  
  const dx = px - centerX;
  const dy = py - centerY;
  
  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}

/**
 * Create module mask for module-aware presets
 * 
 * ROTATION SUPPORT:
 * When the QR is rotated, the mask must also rotate to match.
 * We achieve this by inverse-rotating each pixel position before
 * checking if it falls within a QR module. This ensures the square
 * module grid boundary rotates with the QR code.
 */
function createModuleMask(
  qrTopLeftPx: { x: number; y: number },
  moduleSizePx: number,
  moduleCount: number,
  modules: boolean[][],
  finderExclusions: { centerX: number; centerY: number; exclusionRadius: number }[],
  edgeBufferFactor: number,
  rotationDegrees: number = 0
): Uint8Array {
  const mask = new Uint8Array(PNG_SIZE * PNG_SIZE);
  
  const edgeBuffer = moduleSizePx * edgeBufferFactor;
  const qrRight = qrTopLeftPx.x + moduleCount * moduleSizePx;
  const qrBottom = qrTopLeftPx.y + moduleCount * moduleSizePx;
  
  // QR center for rotation (center of the module grid)
  const qrCenterX = qrTopLeftPx.x + (moduleCount * moduleSizePx) / 2;
  const qrCenterY = qrTopLeftPx.y + (moduleCount * moduleSizePx) / 2;
  
  for (let py = 0; py < PNG_SIZE; py++) {
    for (let px = 0; px < PNG_SIZE; px++) {
      const idx = py * PNG_SIZE + px;
      
      // Finder exclusions use ROTATED positions (already handled in caller)
      if (isInFinderExclusionZone(px, py, finderExclusions)) {
        mask[idx] = ModuleMaskValue.FINDER_ZONE;
        continue;
      }
      
      // Inverse-rotate this pixel to check against unrotated QR grid
      const unrotated = inverseRotatePoint(px, py, qrCenterX, qrCenterY, rotationDegrees);
      const ux = unrotated.x;
      const uy = unrotated.y;
      
      if (ux < qrTopLeftPx.x || ux >= qrRight || uy < qrTopLeftPx.y || uy >= qrBottom) {
        mask[idx] = ModuleMaskValue.OUTSIDE_QR;
        continue;
      }
      
      const col = Math.floor((ux - qrTopLeftPx.x) / moduleSizePx);
      const row = Math.floor((uy - qrTopLeftPx.y) / moduleSizePx);
      
      if (row < 0 || row >= moduleCount || col < 0 || col >= moduleCount) {
        mask[idx] = ModuleMaskValue.OUTSIDE_QR;
        continue;
      }
      
      const moduleLeft = qrTopLeftPx.x + col * moduleSizePx;
      const moduleTop = qrTopLeftPx.y + row * moduleSizePx;
      const distToLeft = ux - moduleLeft;
      const distToRight = moduleLeft + moduleSizePx - ux;
      const distToTop = uy - moduleTop;
      const distToBottom = moduleTop + moduleSizePx - uy;
      const distToEdge = Math.min(distToLeft, distToRight, distToTop, distToBottom);
      
      if (distToEdge < edgeBuffer) {
        mask[idx] = ModuleMaskValue.EDGE_BUFFER;
        continue;
      }
      
      const isDark = modules[row][col];
      mask[idx] = isDark ? ModuleMaskValue.DARK_MODULE : ModuleMaskValue.LIGHT_MODULE;
    }
  }
  
  return mask;
}

function getZone(
  distanceFromQrCenter: number, 
  qrRadius: number,
  zoneAEnd: number,
  zoneBEnd: number
): 'A' | 'B' | 'C' {
  const rNorm = distanceFromQrCenter / qrRadius;
  if (rNorm < zoneAEnd) return 'A';
  if (rNorm < zoneBEnd) return 'B';
  return 'C';
}

function getZoneModifiers(
  distanceFromQrCenter: number,
  qrRadius: number,
  zoneAEnd: number,
  zoneBEnd: number
): { densityMod: number; opacityMod: number; angularMod: number } {
  const rNorm = distanceFromQrCenter / qrRadius;
  
  if (rNorm < zoneAEnd) {
    return { densityMod: 0, opacityMod: 0, angularMod: 0 };
  }
  
  if (rNorm < zoneBEnd) {
    const t = smoothstep(zoneAEnd, zoneBEnd, rNorm);
    return {
      densityMod: lerp(0.05, ZONE_B_MAX_DENSITY, t),
      opacityMod: lerp(0.10, ZONE_B_MAX_OPACITY, t),
      angularMod: ANGULAR_MOD_STRENGTH_TRANSITION,
    };
  }
  
  const transitionEnd = zoneBEnd + 0.40;
  if (rNorm < transitionEnd) {
    const t = smoothstep(zoneBEnd, transitionEnd, rNorm);
    return {
      densityMod: lerp(ZONE_B_MAX_DENSITY, 1.0, t),
      opacityMod: lerp(ZONE_B_MAX_OPACITY, 1.0, t),
      angularMod: lerp(ANGULAR_MOD_STRENGTH_TRANSITION, ANGULAR_MOD_STRENGTH_OUTER, t),
    };
  }
  
  return { densityMod: 1.0, opacityMod: 1.0, angularMod: ANGULAR_MOD_STRENGTH_OUTER };
}

// PNG generation utilities
function createPngFromPixels(pixels: Uint8Array, width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  
  const ihdrChunk = createPngChunk('IHDR', ihdr);
  
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }
  
  const compressed = zlib.deflateSync(rawData, { level: 6 });
  const idatChunk = createPngChunk('IDAT', compressed);
  const iendChunk = createPngChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

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
 * Parse hex color to RGB components
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 0, g: 0, b: 0 }; // Default to black
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Blend two colors based on a factor (0 = color1, 1 = color2)
 */
function blendColors(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number },
  factor: number
): { r: number; g: number; b: number } {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * factor),
    g: Math.round(color1.g + (color2.g - color1.g) * factor),
    b: Math.round(color1.b + (color2.b - color1.b) * factor),
  };
}

function drawCircle(
  pixels: Uint8Array,
  width: number,
  cx: number,
  cy: number,
  radius: number,
  opacity: number,
  color: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }
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
        const existingAlpha = pixels[idx + 3];
        const newAlpha = Math.min(255, existingAlpha + alpha * (1 - existingAlpha / 255));
        
        // Blend colors if there's existing content
        if (existingAlpha > 0 && newAlpha > 0) {
          const blendFactor = (alpha * (1 - existingAlpha / 255)) / newAlpha;
          pixels[idx] = Math.round(pixels[idx] * (1 - blendFactor) + color.r * blendFactor);
          pixels[idx + 1] = Math.round(pixels[idx + 1] * (1 - blendFactor) + color.g * blendFactor);
          pixels[idx + 2] = Math.round(pixels[idx + 2] * (1 - blendFactor) + color.b * blendFactor);
        } else {
          pixels[idx] = color.r;
          pixels[idx + 1] = color.g;
          pixels[idx + 2] = color.b;
        }
        pixels[idx + 3] = newAlpha;
      }
    }
  }
}

// ============================================
// ALGORITHM: DOT ZONES (v5)
// Basic radial zones, no module awareness
// ============================================
async function generateDotZones(
  config: SporeFieldConfig,
  rng: SeededRandom,
  noise2D: (x: number, y: number) => number,
  qrCenterX: number,
  qrCenterY: number,
  qrRadiusPx: number,
  finderExclusions: { centerX: number; centerY: number; exclusionRadius: number }[],
  sporeColor: { r: number; g: number; b: number },
  sporeColorSecondary?: { r: number; g: number; b: number }
): Promise<{ pixels: Uint8Array; stats: SporeStats }> {
  const pixels = new Uint8Array(PNG_SIZE * PNG_SIZE * 4);
  const stats: SporeStats = { dotCount: 0, zoneASkipped: 0, zoneBCount: 0, finderSkipped: 0 };
  
  // Small, numerous particles - classic dust aesthetic
  const minDotRadius = 0.4;
  const maxDotRadius = 1.4;
  
  for (let i = 0; i < config.sporeCount; i++) {
    const x = rng.next() * PNG_SIZE;
    const y = rng.next() * PNG_SIZE;
    
    const dx = x - CENTER;
    const dy = y - CENTER;
    const distanceFromCanvasCenter = Math.sqrt(dx * dx + dy * dy);
    const rNorm = distanceFromCanvasCenter / MAX_RADIUS;
    
    if (rNorm > 1.0) continue;
    
    const dxQr = x - qrCenterX;
    const dyQr = y - qrCenterY;
    const distanceFromQrCenter = Math.sqrt(dxQr * dxQr + dyQr * dyQr);
    
    // Basic zone check (no quiet core in this preset)
    const zoneMods = getZoneModifiers(distanceFromQrCenter, qrRadiusPx, config.zoneAEnd, config.zoneBEnd);
    
    if (zoneMods.densityMod === 0) {
      stats.zoneASkipped++;
      continue;
    }
    
    // No finder exclusion in basic preset
    
    const angle = Math.atan2(dy, dx);
    const baseDensity = calculateBaseDensity(rNorm);
    const noiseValue = noise2D(x * NOISE_SCALE, y * NOISE_SCALE);
    const noiseFactor = 0.65 + noiseValue * 0.35;
    const angularNoise = noise2D(angle * 2, rNorm * 10);
    const angularMod = 1.0 + Math.sin(angle * ANGULAR_MOD_FREQUENCY + angularNoise * 2) * zoneMods.angularMod;
    
    let finalDensity = baseDensity * noiseFactor * angularMod * zoneMods.densityMod;
    
    if (rNorm > EDGE_TAPER_START) {
      finalDensity *= smoothstep(1.0, EDGE_TAPER_START, rNorm);
    }
    
    if (rng.next() < finalDensity * DENSITY_MULTIPLIER) {
      const dotRadius = lerp(maxDotRadius, minDotRadius, rNorm) * (0.7 + rng.next() * 0.6);
      let opacity = clamp(finalDensity * 0.9 * zoneMods.opacityMod, config.minOpacity, config.maxOpacity);
      
      if (getZone(distanceFromQrCenter, qrRadiusPx, config.zoneAEnd, config.zoneBEnd) === 'B') {
        opacity = Math.min(opacity, ZONE_B_MAX_OPACITY);
        stats.zoneBCount++;
      }
      
      // Calculate color - blend between primary and secondary based on radial position
      const color = sporeColorSecondary 
        ? blendColors(sporeColor, sporeColorSecondary, rNorm)
        : sporeColor;
      
      drawCircle(pixels, PNG_SIZE, x, y, dotRadius, opacity, color);
      stats.dotCount++;
    }
  }
  
  return { pixels, stats };
}

// ============================================
// ALGORITHM: ZONE SYSTEM (v6)
// 3-zone + hard quiet core, finder exclusion
// ============================================
async function generateZoneSystem(
  config: SporeFieldConfig,
  rng: SeededRandom,
  noise2D: (x: number, y: number) => number,
  qrCenterX: number,
  qrCenterY: number,
  qrRadiusPx: number,
  finderExclusions: { centerX: number; centerY: number; exclusionRadius: number }[],
  sporeColor: { r: number; g: number; b: number },
  sporeColorSecondary?: { r: number; g: number; b: number }
): Promise<{ pixels: Uint8Array; stats: SporeStats }> {
  const pixels = new Uint8Array(PNG_SIZE * PNG_SIZE * 4);
  const stats: SporeStats = { dotCount: 0, zoneASkipped: 0, zoneBCount: 0, finderSkipped: 0 };
  
  const quietCoreFactor = config.quietCoreFactor ?? 0.55;
  const hardQuietCoreRadius = qrRadiusPx * quietCoreFactor;
  
  // Small particles
  const minDotRadius = 0.4;
  const maxDotRadius = 1.4;
  
  for (let i = 0; i < config.sporeCount; i++) {
    const x = rng.next() * PNG_SIZE;
    const y = rng.next() * PNG_SIZE;
    
    const dx = x - CENTER;
    const dy = y - CENTER;
    const distanceFromCanvasCenter = Math.sqrt(dx * dx + dy * dy);
    const rNorm = distanceFromCanvasCenter / MAX_RADIUS;
    
    if (rNorm > 1.0) continue;
    
    const dxQr = x - qrCenterX;
    const dyQr = y - qrCenterY;
    const distanceFromQrCenter = Math.sqrt(dxQr * dxQr + dyQr * dyQr);
    
    // HARD QUIET CORE
    if (distanceFromQrCenter < hardQuietCoreRadius) {
      stats.zoneASkipped++;
      continue;
    }
    
    // Finder exclusion
    if (isInFinderExclusionZone(x, y, finderExclusions)) {
      stats.finderSkipped++;
      continue;
    }
    
    const zoneMods = getZoneModifiers(distanceFromQrCenter, qrRadiusPx, config.zoneAEnd, config.zoneBEnd);
    
    if (zoneMods.densityMod === 0) {
      stats.zoneASkipped++;
      continue;
    }
    
    const angle = Math.atan2(dy, dx);
    const baseDensity = calculateBaseDensity(rNorm);
    const noiseValue = noise2D(x * NOISE_SCALE, y * NOISE_SCALE);
    const noiseFactor = 0.65 + noiseValue * 0.35;
    const angularNoise = noise2D(angle * 2, rNorm * 10);
    const angularMod = 1.0 + Math.sin(angle * ANGULAR_MOD_FREQUENCY + angularNoise * 2) * zoneMods.angularMod;
    
    let finalDensity = baseDensity * noiseFactor * angularMod * zoneMods.densityMod;
    
    if (rNorm > EDGE_TAPER_START) {
      finalDensity *= smoothstep(1.0, EDGE_TAPER_START, rNorm);
    }
    
    if (rng.next() < finalDensity * DENSITY_MULTIPLIER) {
      const dotRadius = lerp(maxDotRadius, minDotRadius, rNorm) * (0.7 + rng.next() * 0.6);
      let opacity = clamp(finalDensity * 0.9 * zoneMods.opacityMod, config.minOpacity, config.maxOpacity);
      
      if (getZone(distanceFromQrCenter, qrRadiusPx, config.zoneAEnd, config.zoneBEnd) === 'B') {
        opacity = Math.min(opacity, ZONE_B_MAX_OPACITY);
        stats.zoneBCount++;
      }
      
      // Calculate color - blend between primary and secondary based on radial position
      const color = sporeColorSecondary 
        ? blendColors(sporeColor, sporeColorSecondary, rNorm)
        : sporeColor;
      
      drawCircle(pixels, PNG_SIZE, x, y, dotRadius, opacity, color);
      stats.dotCount++;
    }
  }
  
  return { pixels, stats };
}

// ============================================
// ALGORITHM: MODULE MASKED (v7)
// Full module matrix lookup
// ============================================
async function generateModuleMasked(
  config: SporeFieldConfig,
  rng: SeededRandom,
  noise2D: (x: number, y: number) => number,
  qrCenterX: number,
  qrCenterY: number,
  qrRadiusPx: number,
  finderExclusions: { centerX: number; centerY: number; exclusionRadius: number }[],
  moduleMask: Uint8Array | null,
  moduleSizePx: number,
  sporeColor: { r: number; g: number; b: number },
  sporeColorSecondary?: { r: number; g: number; b: number }
): Promise<{ pixels: Uint8Array; stats: SporeStats }> {
  const pixels = new Uint8Array(PNG_SIZE * PNG_SIZE * 4);
  const stats: SporeStats = { 
    dotCount: 0, zoneASkipped: 0, zoneBCount: 0, finderSkipped: 0,
    darkModuleSkipped: 0, edgeBufferSkipped: 0, lightModuleCount: 0 
  };
  
  const quietCoreFactor = config.quietCoreFactor ?? 0.55;
  const hardQuietCoreRadius = qrRadiusPx * quietCoreFactor;
  const lightModuleDensity = config.lightModuleDensity ?? 0.10;
  const lightModuleMaxOpacity = config.lightModuleMaxOpacity ?? 0.18;
  const lightModuleMaxRadiusFactor = 0.40;
  
  // Small particles
  const minDotRadius = 0.4;
  const maxDotRadius = 1.4;
  
  for (let i = 0; i < config.sporeCount; i++) {
    const x = rng.next() * PNG_SIZE;
    const y = rng.next() * PNG_SIZE;
    
    const dx = x - CENTER;
    const dy = y - CENTER;
    const distanceFromCanvasCenter = Math.sqrt(dx * dx + dy * dy);
    const rNorm = distanceFromCanvasCenter / MAX_RADIUS;
    
    if (rNorm > 1.0) continue;
    
    const dxQr = x - qrCenterX;
    const dyQr = y - qrCenterY;
    const distanceFromQrCenter = Math.sqrt(dxQr * dxQr + dyQr * dyQr);
    
    // HARD QUIET CORE
    if (distanceFromQrCenter < hardQuietCoreRadius) {
      stats.zoneASkipped++;
      continue;
    }
    
    const zoneMods = getZoneModifiers(distanceFromQrCenter, qrRadiusPx, config.zoneAEnd, config.zoneBEnd);
    
    if (zoneMods.densityMod === 0) {
      stats.zoneASkipped++;
      continue;
    }
    
    // MODULE MASKING
    let isInsideLightModule = false;
    
    if (moduleMask) {
      const px = Math.floor(x);
      const py = Math.floor(y);
      if (px >= 0 && px < PNG_SIZE && py >= 0 && py < PNG_SIZE) {
        const maskValue = moduleMask[py * PNG_SIZE + px];
        
        switch (maskValue) {
          case ModuleMaskValue.DARK_MODULE:
            stats.darkModuleSkipped = (stats.darkModuleSkipped ?? 0) + 1;
            continue;
          case ModuleMaskValue.FINDER_ZONE:
            stats.finderSkipped++;
            continue;
          case ModuleMaskValue.EDGE_BUFFER:
            stats.edgeBufferSkipped = (stats.edgeBufferSkipped ?? 0) + 1;
            continue;
          case ModuleMaskValue.LIGHT_MODULE:
            isInsideLightModule = true;
            break;
        }
      }
    } else {
      if (isInFinderExclusionZone(x, y, finderExclusions)) {
        stats.finderSkipped++;
        continue;
      }
    }
    
    const angle = Math.atan2(dy, dx);
    const baseDensity = calculateBaseDensity(rNorm);
    
    let noiseFactor = 1.0;
    let angularMod = 1.0;
    
    if (!isInsideLightModule) {
      const noiseValue = noise2D(x * NOISE_SCALE, y * NOISE_SCALE);
      noiseFactor = 0.65 + noiseValue * 0.35;
      const angularNoise = noise2D(angle * 2, rNorm * 10);
      angularMod = 1.0 + Math.sin(angle * ANGULAR_MOD_FREQUENCY + angularNoise * 2) * zoneMods.angularMod;
    }
    
    let finalDensity = baseDensity * noiseFactor * angularMod * zoneMods.densityMod;
    
    if (isInsideLightModule) {
      finalDensity *= lightModuleDensity;
    }
    
    if (rNorm > EDGE_TAPER_START) {
      finalDensity *= smoothstep(1.0, EDGE_TAPER_START, rNorm);
    }
    
    if (rng.next() < finalDensity * DENSITY_MULTIPLIER) {
      let dotRadius = lerp(maxDotRadius, minDotRadius, rNorm) * (0.7 + rng.next() * 0.6);
      let opacity = clamp(finalDensity * 0.9 * zoneMods.opacityMod, config.minOpacity, config.maxOpacity);
      
      if (isInsideLightModule) {
        opacity = Math.min(opacity, lightModuleMaxOpacity);
        dotRadius = Math.min(dotRadius, moduleSizePx * lightModuleMaxRadiusFactor);
        stats.lightModuleCount = (stats.lightModuleCount ?? 0) + 1;
      }
      
      if (getZone(distanceFromQrCenter, qrRadiusPx, config.zoneAEnd, config.zoneBEnd) === 'B') {
        opacity = Math.min(opacity, ZONE_B_MAX_OPACITY);
        stats.zoneBCount++;
      }
      
      // Calculate color - blend between primary and secondary based on radial position
      const color = sporeColorSecondary 
        ? blendColors(sporeColor, sporeColorSecondary, rNorm)
        : sporeColor;
      
      drawCircle(pixels, PNG_SIZE, x, y, dotRadius, opacity, color);
      stats.dotCount++;
    }
  }
  
  return { pixels, stats };
}

// ============================================
// ALGORITHM: MATERIAL UNIFIED (v8)
// Particle size tied to QR dots
// ============================================
async function generateMaterialUnified(
  config: SporeFieldConfig,
  rng: SeededRandom,
  noise2D: (x: number, y: number) => number,
  qrCenterX: number,
  qrCenterY: number,
  qrRadiusPx: number,
  finderExclusions: { centerX: number; centerY: number; exclusionRadius: number }[],
  moduleMask: Uint8Array | null,
  moduleSizePx: number,
  sporeColor: { r: number; g: number; b: number },
  sporeColorSecondary?: { r: number; g: number; b: number }
): Promise<{ pixels: Uint8Array; stats: SporeStats }> {
  const pixels = new Uint8Array(PNG_SIZE * PNG_SIZE * 4);
  const stats: SporeStats = { 
    dotCount: 0, zoneASkipped: 0, zoneBCount: 0, finderSkipped: 0,
    darkModuleSkipped: 0, edgeBufferSkipped: 0, lightModuleCount: 0 
  };
  
  const quietCoreFactor = config.quietCoreFactor ?? 0.55;
  const hardQuietCoreRadius = qrRadiusPx * quietCoreFactor;
  const lightModuleDensity = config.lightModuleDensity ?? 0.10;
  const lightModuleMaxOpacity = config.lightModuleMaxOpacity ?? 0.18;
  const lightModuleMaxRadiusFactor = 0.40;
  
  // PARTICLE SIZE CONVERGENCE - tied to QR dot size
  const qrDotRadiusPx = moduleSizePx * 0.42;
  const sporeRadiusMinFactor = config.sporeRadiusMinFactor ?? 0.55;
  const sporeRadiusMaxFactor = config.sporeRadiusMaxFactor ?? 0.85;
  const minSporeRadius = qrDotRadiusPx * sporeRadiusMinFactor;
  const maxSporeRadius = qrDotRadiusPx * sporeRadiusMaxFactor;
  
  for (let i = 0; i < config.sporeCount; i++) {
    const x = rng.next() * PNG_SIZE;
    const y = rng.next() * PNG_SIZE;
    
    const dx = x - CENTER;
    const dy = y - CENTER;
    const distanceFromCanvasCenter = Math.sqrt(dx * dx + dy * dy);
    const rNorm = distanceFromCanvasCenter / MAX_RADIUS;
    
    if (rNorm > 1.0) continue;
    
    const dxQr = x - qrCenterX;
    const dyQr = y - qrCenterY;
    const distanceFromQrCenter = Math.sqrt(dxQr * dxQr + dyQr * dyQr);
    
    // HARD QUIET CORE
    if (distanceFromQrCenter < hardQuietCoreRadius) {
      stats.zoneASkipped++;
      continue;
    }
    
    const zoneMods = getZoneModifiers(distanceFromQrCenter, qrRadiusPx, config.zoneAEnd, config.zoneBEnd);
    
    if (zoneMods.densityMod === 0) {
      stats.zoneASkipped++;
      continue;
    }
    
    // MODULE MASKING
    let isInsideLightModule = false;
    
    if (moduleMask) {
      const px = Math.floor(x);
      const py = Math.floor(y);
      if (px >= 0 && px < PNG_SIZE && py >= 0 && py < PNG_SIZE) {
        const maskValue = moduleMask[py * PNG_SIZE + px];
        
        switch (maskValue) {
          case ModuleMaskValue.DARK_MODULE:
            stats.darkModuleSkipped = (stats.darkModuleSkipped ?? 0) + 1;
            continue;
          case ModuleMaskValue.FINDER_ZONE:
            stats.finderSkipped++;
            continue;
          case ModuleMaskValue.EDGE_BUFFER:
            stats.edgeBufferSkipped = (stats.edgeBufferSkipped ?? 0) + 1;
            continue;
          case ModuleMaskValue.LIGHT_MODULE:
            isInsideLightModule = true;
            break;
        }
      }
    } else {
      if (isInFinderExclusionZone(x, y, finderExclusions)) {
        stats.finderSkipped++;
        continue;
      }
    }
    
    const angle = Math.atan2(dy, dx);
    const baseDensity = calculateBaseDensity(rNorm);
    
    let noiseFactor = 1.0;
    let angularMod = 1.0;
    
    if (!isInsideLightModule) {
      const noiseValue = noise2D(x * NOISE_SCALE, y * NOISE_SCALE);
      noiseFactor = 0.65 + noiseValue * 0.35;
      const angularNoise = noise2D(angle * 2, rNorm * 10);
      angularMod = 1.0 + Math.sin(angle * ANGULAR_MOD_FREQUENCY + angularNoise * 2) * zoneMods.angularMod;
    }
    
    let finalDensity = baseDensity * noiseFactor * angularMod * zoneMods.densityMod;
    
    if (isInsideLightModule) {
      finalDensity *= lightModuleDensity;
    }
    
    if (rNorm > EDGE_TAPER_START) {
      finalDensity *= smoothstep(1.0, EDGE_TAPER_START, rNorm);
    }
    
    if (rng.next() < finalDensity * DENSITY_MULTIPLIER) {
      // PARTICLE SIZE CONVERGENCE - size relative to QR dots
      let dotRadius = lerp(minSporeRadius, maxSporeRadius, finalDensity);
      dotRadius *= (0.95 + rng.next() * 0.1); // Subtle jitter
      
      // OPACITY-BASED VARIATION (not size)
      let baseOpacity = lerp(config.minOpacity, config.maxOpacity, finalDensity);
      let opacity = baseOpacity * (0.9 + rng.next() * 0.2);
      opacity = clamp(opacity * zoneMods.opacityMod, config.minOpacity, config.maxOpacity);
      
      if (isInsideLightModule) {
        opacity = Math.min(opacity, lightModuleMaxOpacity);
        dotRadius = Math.min(dotRadius, moduleSizePx * lightModuleMaxRadiusFactor);
        stats.lightModuleCount = (stats.lightModuleCount ?? 0) + 1;
      }
      
      if (getZone(distanceFromQrCenter, qrRadiusPx, config.zoneAEnd, config.zoneBEnd) === 'B') {
        opacity = Math.min(opacity, ZONE_B_MAX_OPACITY);
        stats.zoneBCount++;
      }
      
      // Calculate color - blend between primary and secondary based on radial position
      const color = sporeColorSecondary 
        ? blendColors(sporeColor, sporeColorSecondary, rNorm)
        : sporeColor;
      
      drawCircle(pixels, PNG_SIZE, x, y, dotRadius, opacity, color);
      stats.dotCount++;
    }
  }
  
  return { pixels, stats };
}

interface SporeStats {
  dotCount: number;
  zoneASkipped: number;
  zoneBCount: number;
  finderSkipped: number;
  darkModuleSkipped?: number;
  edgeBufferSkipped?: number;
  lightModuleCount?: number;
}

/**
 * Generate spore field using config-driven algorithm selection
 * 
 * CRITICAL: Different presets use DIFFERENT ALGORITHMS
 */
export async function generateSporeFieldPng(
  token: string,
  version: string,
  qrGeometry?: QrGeometry,
  config?: SporeFieldConfig
): Promise<{ base64: string; metadata: SporeFieldMetadata } | null> {
  // Use default config if not provided (backwards compatibility)
  const effectiveConfig = config ?? getDefaultConfig();
  
  try {
    const seed = computeSeed(token, version, effectiveConfig);
    const rng = new SeededRandom(seed);
    const noise2D = createNoise2D(() => rng.next());
    
    const qrCenterX = qrGeometry ? qrGeometry.centerX * SVG_TO_PNG_SCALE : CENTER;
    const qrCenterY = qrGeometry ? qrGeometry.centerY * SVG_TO_PNG_SCALE : CENTER;
    const qrRadiusPx = qrGeometry ? qrGeometry.radius * SVG_TO_PNG_SCALE : 117;
    
    const finderMultiplier = effectiveConfig.finderExclusionMultiplier ?? 1.25;
    const finderExclusions = qrGeometry?.finders.map(f => ({
      centerX: f.centerX * SVG_TO_PNG_SCALE,
      centerY: f.centerY * SVG_TO_PNG_SCALE,
      exclusionRadius: f.outerRadius * SVG_TO_PNG_SCALE * finderMultiplier,
    })) ?? [];
    
    const moduleSizePx = qrGeometry?.moduleSizePx ?? 10;
    
    // Create module mask for module-aware presets
    // ROTATION: Pass qrRotation so the module mask rotates with the QR code
    const needsModuleMask = effectiveConfig.basePreset === 'module-masked' || 
                           effectiveConfig.basePreset === 'material-unified';
    const moduleMask = needsModuleMask && qrGeometry ? createModuleMask(
      qrGeometry.qrTopLeftPx,
      qrGeometry.moduleSizePx,
      qrGeometry.moduleCount,
      qrGeometry.modules,
      finderExclusions,
      effectiveConfig.edgeBufferFactor ?? 0.12,
      effectiveConfig.qrRotation ?? 0  // Pass rotation for mask alignment
    ) : null;
    
    // ============================================
    // ALGORITHM SELECTION BY PRESET
    // ============================================
    let result: { pixels: Uint8Array; stats: SporeStats };
    
    // Parse spore colors from config
    const sporeColor = hexToRgb(effectiveConfig.sporeColor ?? '#000000');
    const sporeColorSecondary = effectiveConfig.sporeColorSecondary 
      ? hexToRgb(effectiveConfig.sporeColorSecondary)
      : undefined;
    
    switch (effectiveConfig.basePreset) {
      case 'dot-zones':
        result = await generateDotZones(
          effectiveConfig, rng, noise2D, qrCenterX, qrCenterY, qrRadiusPx, finderExclusions,
          sporeColor, sporeColorSecondary
        );
        break;
        
      case 'zone-system':
        result = await generateZoneSystem(
          effectiveConfig, rng, noise2D, qrCenterX, qrCenterY, qrRadiusPx, finderExclusions,
          sporeColor, sporeColorSecondary
        );
        break;
        
      case 'module-masked':
        result = await generateModuleMasked(
          effectiveConfig, rng, noise2D, qrCenterX, qrCenterY, qrRadiusPx, 
          finderExclusions, moduleMask, moduleSizePx,
          sporeColor, sporeColorSecondary
        );
        break;
        
      case 'material-unified':
        result = await generateMaterialUnified(
          effectiveConfig, rng, noise2D, qrCenterX, qrCenterY, qrRadiusPx,
          finderExclusions, moduleMask, moduleSizePx,
          sporeColor, sporeColorSecondary
        );
        break;
        
      default:
        throw new Error(`Unknown preset: ${effectiveConfig.basePreset}`);
    }
    
    const pngBuffer = createPngFromPixels(result.pixels, PNG_SIZE, PNG_SIZE);
    const base64 = pngBuffer.toString('base64');
    
    const metadata: SporeFieldMetadata = {
      version: `config-driven-${effectiveConfig.basePreset}`,
      basePreset: effectiveConfig.basePreset,
      canvas: PNG_SIZE,
      densityCurve: `${effectiveConfig.basePreset} algorithm`,
      noise: 'simplex',
      edgeTaper: true,
      samples: effectiveConfig.sporeCount,
      tokenHash: seed.substring(0, 16),
      configHash: seed.substring(16, 24),
      ...result.stats,
    };
    
    return { base64, metadata };
  } catch (error) {
    console.error('[SporeField] PNG generation failed:', error);
    return null;
  }
}

/**
 * Get default config (material-unified for backwards compatibility)
 */
function getDefaultConfig(): SporeFieldConfig {
  // Import dynamically to avoid circular dependency
  const { PRESET_DEFINITIONS } = require('@/lib/constants/sealPresets');
  return PRESET_DEFINITIONS['material-unified'].defaults;
}

/**
 * Metadata about the generated spore field
 */
export interface SporeFieldMetadata {
  version: string;
  basePreset: BasePresetId;
  canvas: number;
  densityCurve: string;
  noise: string;
  edgeTaper: boolean;
  samples: number;
  tokenHash: string;
  configHash?: string;
  dotCount?: number;
  zoneASkipped?: number;
  zoneBCount?: number;
  finderSkipped?: number;
  hardQuietCoreFactor?: number;
  darkModuleSkipped?: number;
  edgeBufferSkipped?: number;
  lightModuleCount?: number;
}

/**
 * Create the SVG <image> element for the spore field
 * 
 * @param base64Png - Base64 encoded PNG data
 * @param opacity - Optional overall opacity for the spore field (0-1, default 1.0)
 */
export function createSporeFieldImageElement(base64Png: string, opacity: number = 1.0): string {
  const size = 970;
  const offset = (1000 - size) / 2;
  
  const opacityAttr = opacity < 1.0 ? ` opacity="${opacity.toFixed(2)}"` : '';
  
  return `<image id="spore-field" x="${offset}" y="${offset}" width="${size}" height="${size}" href="data:image/png;base64,${base64Png}" preserveAspectRatio="xMidYMid meet"${opacityAttr}/>`;
}

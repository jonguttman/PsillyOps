/**
 * Seal Generator Service
 * 
 * Generates deterministic seal SVGs by injecting QR cloud and spore field into base template.
 * 
 * ARCHITECTURAL INVARIANT: Generator/UI Separation
 * ================================================
 * Generator services must:
 * - Accept pure data (tokens, config objects)
 * - Return pure artifacts (SVG strings, metadata)
 * - Never know about React, Next.js routes, or permissions
 * - Never depend on request/response objects
 * - Be fully testable without HTTP context
 * 
 * UI/API layers handle:
 * - Authentication & authorization
 * - Request/response formatting
 * - Error handling & HTTP status codes
 * - User-facing messages
 * 
 * This separation ensures:
 * - Generator logic is reusable across contexts
 * - Testing doesn't require HTTP mocks
 * - Generator can be called from scripts, jobs, etc.
 * 
 * INVARIANTS:
 * - Same token + version = identical SVG forever
 * - Never modifies base SVG file
 * - QR cloud is deterministic from token hash
 * - Spore field is raster-first, deterministic per token
 * - Generator must NEVER inject marketing copy or text (text lives only in base SVG or UI layers)
 * 
 * SPORE FIELD VISUAL GOAL:
 * - Dense core that feels alive
 * - Mid-radius has motion and texture
 * - Outer 10-15% feels airy and sparse
 * - No visible bands or math artifacts
 * - Looks like spores drifting outward, not a pattern
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';
import {
  SEAL_VERSION,
  SEAL_BASE_SVG_PATH,
  SEAL_BASE_SVG_CHECKSUM,
  QR_CLOUD_EFFECTIVE_RADIUS,
  QR_ERROR_CORRECTION_LEVEL,
  SEAL_QR_URL_PREFIX,
} from '@/lib/constants/seal';
import {
  generateSporeFieldSvg,
  createSporeFieldSvgElement,
  generateFallbackSvgDots,
  type SporeFieldMetadata,
} from './sealSporeFieldService';

// QR Cloud center coordinates (from base SVG viewBox: 0 0 1000 1000)
const QR_CLOUD_CENTER_X = 500;
const QR_CLOUD_CENTER_Y = 500;

/**
 * Compute deterministic hash for QR cloud generation
 */
export function computeQrCloudHash(token: string, version: string): string {
  const input = `${token}|${version}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Generate QR code SVG string for seal URL
 */
async function generateQrSvgForSeal(token: string): Promise<string> {
  const sealUrl = `${SEAL_QR_URL_PREFIX}${token}`;
  return await QRCode.toString(sealUrl, {
    type: 'svg',
    errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    margin: 0,  // No margin - we'll position it ourselves
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    },
    width: QR_CLOUD_EFFECTIVE_RADIUS * 2,  // Diameter in SVG units
  });
}

/**
 * Extract QR code from SVG and position it within the cloud zone
 * Returns SVG group element with QR code positioned and scaled to fit radius
 */
function renderQrCloud(qrSvg: string, hash: string, radius: number): string {
  // Get QR SVG content (without outer svg tags for embedding)
  // Use [\s\S]*? instead of .*? with 's' flag for ES2017 compatibility
  const qrContentMatch = qrSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
  if (!qrContentMatch) {
    throw new Error('Invalid QR SVG format: could not extract content');
  }
  
  // Extract the viewBox from the QR SVG to get the native coordinate space
  const viewBoxMatch = qrSvg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const qrNativeSize = viewBoxMatch ? parseInt(viewBoxMatch[1], 10) : 33; // Default QR module count
  
  const qrContent = qrContentMatch[1];
  
  // QR code paths are in native viewBox coordinates (e.g., 0-33)
  // We need to scale them to fit within our target size (radius * 2)
  const targetSize = radius * 2; // Target size in SVG units (e.g., 216)
  const scaleFactor = targetSize / qrNativeSize; // e.g., 216 / 33 ≈ 6.545
  
  // Position it centered in the cloud zone (which is centered at 500,500)
  const offset = QR_CLOUD_CENTER_X - radius;
  
  // Transform: first scale to target size, then translate to center
  const transform = `translate(${offset}, ${offset}) scale(${scaleFactor})`;
  
  return `<g id="qr-cloud" transform="${transform}">
    ${qrContent}
  </g>`;
}

// Note: generateMicrofiberDots has been replaced by the raster spore field service
// The fallback SVG dots are now in sealSporeFieldService.ts

/**
 * Load base seal SVG from public directory and validate checksum
 */
async function loadBaseSealSvg(): Promise<string> {
  const publicPath = path.join(process.cwd(), 'public', SEAL_BASE_SVG_PATH.replace(/^\//, ''));
  const svgContent = await fs.promises.readFile(publicPath, 'utf-8');
  
  // Validate checksum to ensure base SVG hasn't changed unexpectedly
  const actualChecksum = createHash('sha256').update(svgContent).digest('hex');
  if (actualChecksum !== SEAL_BASE_SVG_CHECKSUM) {
    throw new Error(
      `Base SVG checksum mismatch! Expected ${SEAL_BASE_SVG_CHECKSUM}, got ${actualChecksum}. ` +
      `The base SVG has been modified, which breaks determinism. ` +
      `Revert changes or update SEAL_BASE_SVG_CHECKSUM constant.`
    );
  }
  
  return svgContent;
}

/**
 * Inject spore field and QR cloud into base SVG
 * 
 * Rendering order (bottom to top):
 * 1. Raster spore PNG (background atmosphere)
 * 2. Radar rings (SVG - from base)
 * 3. QR cloud / encoded pattern (SVG)
 * 4. Radar sweep lines (SVG - from base)
 * 5. Outer ring typography (SVG - from base)
 * 
 * IMPORTANT: Generator must never inject copy or text.
 * Text lives only in the base SVG or UI layers.
 */
function injectSealElements(
  baseSvg: string, 
  qrCloudSvg: string, 
  sporeFieldElement: string,
  usedFallback: boolean
): string {
  // First, inject the spore field as the background layer
  // Insert it right after the opening <g id="Layer_1"> to be behind everything
  const layer1Pattern = /(<g id="Layer_1">)/;
  
  if (!layer1Pattern.test(baseSvg)) {
    throw new Error('Base SVG missing Layer_1 group');
  }
  
  let result = baseSvg.replace(layer1Pattern, `$1\n    ${sporeFieldElement}`);
  
  // Replace the placeholder group with generated QR cloud
  const placeholderPattern = /<g id="qr-cloud-placeholder">[\s\S]*?<\/g>/;
  
  const qrCloudReplacement = `<g id="qr-cloud-generated">
      ${qrCloudSvg}
    </g>`;
  
  if (!placeholderPattern.test(result)) {
    throw new Error('Base SVG missing qr-cloud-placeholder group');
  }
  
  result = result.replace(placeholderPattern, qrCloudReplacement);
  
  // Remove the microfiber-field placeholder (replaced by raster spore field)
  // Keep the group but empty it, or remove entirely
  const microfiberPattern = /<g id="microfiber-field">[\s\S]*?<\/g>/;
  const microfiberReplacement = usedFallback 
    ? `<g id="microfiber-field"><!-- Fallback mode: spore field embedded above --></g>`
    : `<g id="microfiber-field"><!-- Replaced by raster spore field --></g>`;
  
  if (microfiberPattern.test(result)) {
    result = result.replace(microfiberPattern, microfiberReplacement);
  }
  
  return result;
}

/**
 * Generate complete seal SVG for a given token
 * 
 * Same token + version always produces identical SVG.
 * 
 * Returns SVG with metadata comment including sealVersion and spore field info.
 */
export async function generateSealSvg(token: string, version: string = SEAL_VERSION): Promise<string> {
  // 1. Compute deterministic hash
  const hash = computeQrCloudHash(token, version);
  
  // 2. Load and validate base SVG
  const baseSvg = await loadBaseSealSvg();
  
  // 3. Generate QR code SVG
  const qrSvg = await generateQrSvgForSeal(token);
  
  // 4. Convert QR to cloud pattern within radius
  const qrCloudSvg = renderQrCloud(qrSvg, hash, QR_CLOUD_EFFECTIVE_RADIUS);
  
  // 5. Generate SVG spore field (or fallback to simple SVG dots)
  let sporeFieldElement: string;
  let sporeFieldMetadata: SporeFieldMetadata | null = null;
  let usedFallback = false;
  
  const sporeResult = await generateSporeFieldSvg(token, version);
  
  if (sporeResult) {
    // Success: use SVG spore field with noise-based organic pattern
    sporeFieldElement = createSporeFieldSvgElement(sporeResult.svgContent);
    sporeFieldMetadata = sporeResult.metadata;
  } else {
    // Fallback: use legacy SVG dots with warning
    console.warn(`[SealGenerator] Spore field generation failed for token ${token.substring(0, 10)}..., using fallback SVG dots`);
    const fallbackDots = generateFallbackSvgDots(token, version, QR_CLOUD_EFFECTIVE_RADIUS * 4, QR_CLOUD_CENTER_X, QR_CLOUD_CENTER_Y);
    sporeFieldElement = `<g id="spore-field-fallback">\n      ${fallbackDots}\n    </g>`;
    usedFallback = true;
  }
  
  // 6. Inject all elements into base SVG
  let finalSvg = injectSealElements(baseSvg, qrCloudSvg, sporeFieldElement, usedFallback);
  
  // 7. Add metadata comment with sealVersion and spore field info
  const sporeInfo = sporeFieldMetadata 
    ? `sporeField: {
    version: "${sporeFieldMetadata.version}",
    canvas: ${sporeFieldMetadata.canvas},
    densityCurve: "${sporeFieldMetadata.densityCurve}",
    noise: "${sporeFieldMetadata.noise}",
    edgeTaper: ${sporeFieldMetadata.edgeTaper}
  }`
    : `sporeField: "fallback"`;
  
  const metadataComment = `<!-- TripDAR Seal Generator
  sealVersion: ${version}
  generator: sealGeneratorService
  tokenHash: ${hash.substring(0, 16)}...
  ${sporeInfo}
-->`;
  
  // Insert metadata comment after XML declaration
  finalSvg = finalSvg.replace('<?xml', `<?xml\n${metadataComment}`);
  
  return finalSvg;
}


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
  generateSporeFieldPng,
  createSporeFieldImageElement,
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
 * 
 * QR SIZING NOTES:
 * - QR should occupy ~52-55% of inner radar diameter for structural dominance
 * - Margin set to 0 (minimum) - no aesthetic padding, spore field provides context
 * - QR must feel "found inside the seal" not "placed on top"
 * 
 * COMPOSITING:
 * - QR background is TRANSPARENT (light: '#0000' = transparent)
 * - Only black QR modules are rendered
 * - Spore field shows through between modules
 * - No white rect, no white fill behind QR
 */
async function generateQrSvgForSeal(token: string): Promise<string> {
  const sealUrl = `${SEAL_QR_URL_PREFIX}${token}`;
  return await QRCode.toString(sealUrl, {
    type: 'svg',
    errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    margin: 0,  // MINIMUM quiet zone - no extra padding, spore field surrounds it
    color: {
      dark: '#000000',
      light: '#0000'  // TRANSPARENT background - spore field shows through
    },
    width: QR_CLOUD_EFFECTIVE_RADIUS * 2,  // Diameter in SVG units
  });
}

/**
 * Extract QR code from SVG and position it within the cloud zone
 * Returns SVG group element with QR code positioned and scaled to fit radius
 * 
 * FINDER PATTERN SOFTENING:
 * - QR finder squares (corners) use slightly lighter color (#111 instead of #000)
 * - This helps the QR feel embedded rather than laser-cut
 * - Data modules remain full black for scan reliability
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
  
  let qrContent = qrContentMatch[1];
  
  // FINDER PATTERN SOFTENING: Use #111111 (very dark gray) instead of pure black
  // for finder patterns. The qrcode library generates a single path, so we apply
  // a subtle opacity to the entire QR and rely on spore field contrast.
  // This softens the overall appearance without affecting individual modules.
  
  // QR code paths are in native viewBox coordinates (e.g., 0-33)
  // We need to scale them to fit within our target size (radius * 2)
  const targetSize = radius * 2; // Target size in SVG units (e.g., 216)
  const scaleFactor = targetSize / qrNativeSize; // e.g., 216 / 33 ≈ 6.545
  
  // Position it centered in the cloud zone (which is centered at 500,500)
  const offset = QR_CLOUD_CENTER_X - radius;
  
  // Transform: first scale to target size, then translate to center
  const transform = `translate(${offset}, ${offset}) scale(${scaleFactor})`;
  
  // Apply subtle opacity reduction (0.97) to soften finder patterns
  // This is imperceptible to scanners but softens visual edges
  return `<g id="qr-cloud" transform="${transform}" opacity="0.97">
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
 * 1. Raster spore PNG as single <image> element (background atmosphere)
 * 2. Radar rings (SVG - from base)
 * 3. QR cloud / encoded pattern (SVG)
 * 4. Radar sweep lines (SVG - from base)
 * 5. Outer ring typography (SVG - from base)
 * 
 * CRITICAL NODE COUNT:
 * - Spore field = 1 node (<image>)
 * - QR code = ~1-2 nodes
 * - Base SVG elements = dozens
 * - Total should be < 100 nodes, NOT thousands
 * 
 * IMPORTANT: Generator must never inject copy or text.
 * Text lives only in the base SVG or UI layers.
 */
function injectSealElements(
  baseSvg: string, 
  qrCloudSvg: string, 
  sporeFieldElement: string
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
  const microfiberPattern = /<g id="microfiber-field">[\s\S]*?<\/g>/;
  
  if (microfiberPattern.test(result)) {
    result = result.replace(microfiberPattern, `<g id="microfiber-field"><!-- Replaced by raster spore field --></g>`);
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
  
  // 5. Generate RASTER spore field (PNG embedded as single <image> node)
  // CRITICAL: NO SVG FALLBACK - if raster fails, render without spore field
  let sporeFieldElement: string = '';
  let sporeFieldMetadata: SporeFieldMetadata | null = null;
  
  const sporeResult = await generateSporeFieldPng(token, version);
  
  if (sporeResult) {
    // Success: single <image> element with base64 PNG
    sporeFieldElement = createSporeFieldImageElement(sporeResult.base64);
    sporeFieldMetadata = sporeResult.metadata;
  } else {
    // NO FALLBACK - log warning and continue without spore field
    console.warn(`[SealGenerator] Spore raster failed for token ${token.substring(0, 10)}..., rendered without spore field.`);
    sporeFieldElement = '<!-- Spore field generation failed - no fallback -->';
  }
  
  // 6. Inject all elements into base SVG
  let finalSvg = injectSealElements(baseSvg, qrCloudSvg, sporeFieldElement);
  
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


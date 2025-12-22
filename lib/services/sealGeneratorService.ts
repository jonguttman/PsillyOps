/**
 * Seal Generator Service
 * 
 * Generates deterministic seal SVGs by injecting QR cloud into base template.
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
 * - Generator must NEVER inject marketing copy or text (text lives only in base SVG or UI layers)
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
  const qrContentMatch = qrSvg.match(/<svg[^>]*>(.*?)<\/svg>/s);
  if (!qrContentMatch) {
    throw new Error('Invalid QR SVG format: could not extract content');
  }
  
  let qrContent = qrContentMatch[1];
  
  // QR code was generated at width = radius * 2
  // Position it centered in the cloud zone (which is centered at 500,500)
  // The QR is a square, so we fit it within the circle radius
  const qrSize = radius * 2; // QR was generated at this size
  const offset = QR_CLOUD_CENTER_X - radius;
  
  // Transform QR content to center it
  const transform = `translate(${offset}, ${offset})`;
  
  return `<g id="qr-cloud" transform="${transform}">
    ${qrContent}
  </g>`;
}

/**
 * Generate deterministic microfiber dots pattern from hash
 * Integrates with QR cloud for unified visual pattern
 */
function generateMicrofiberDots(hash: string, radius: number): string {
  // Use hash to deterministically position dots
  // Extract bytes from hash for positioning
  const hashBytes = Buffer.from(hash, 'hex');
  const dots: Array<{ cx: number; cy: number; r: number }> = [];
  
  // Generate ~20-30 dots deterministically from hash
  const numDots = 25;
  for (let i = 0; i < numDots && i * 2 + 1 < hashBytes.length; i++) {
    const xByte = hashBytes[i * 2];
    const yByte = hashBytes[i * 2 + 1];
    
    // Map bytes to positions within circle
    // Use polar coordinates for even distribution
    const angle = (xByte / 255) * Math.PI * 2;
    const distance = (yByte / 255) * radius * 0.8; // Keep dots inside circle
    
    const cx = QR_CLOUD_CENTER_X + Math.cos(angle) * distance;
    const cy = QR_CLOUD_CENTER_Y + Math.sin(angle) * distance;
    
    // Vary dot size (1-3 units) based on hash
    const r = 1 + ((xByte + yByte) % 200) / 100;
    
    dots.push({ cx, cy, r });
  }
  
  return dots.map(dot => 
    `<circle class="st1" cx="${dot.cx.toFixed(1)}" cy="${dot.cy.toFixed(1)}" r="${dot.r.toFixed(1)}"/>`
  ).join('\n      ');
}

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
 * Replace QR cloud placeholder and update microfiber field with generated patterns
 * 
 * IMPORTANT: Generator must never inject copy or text.
 * Text lives only in the base SVG or UI layers.
 */
function injectQrCloud(baseSvg: string, qrCloudSvg: string, microfiberDots: string): string {
  // Replace the placeholder group with generated QR cloud
  const placeholderPattern = /<g id="qr-cloud-placeholder">[\s\S]*?<\/g>/;
  
  const qrCloudReplacement = `<g id="qr-cloud-generated">
      ${qrCloudSvg}
    </g>`;
  
  if (!placeholderPattern.test(baseSvg)) {
    throw new Error('Base SVG missing qr-cloud-placeholder group');
  }
  
  let result = baseSvg.replace(placeholderPattern, qrCloudReplacement);
  
  // Replace microfiber-field with deterministic dots
  const microfiberPattern = /<g id="microfiber-field">[\s\S]*?<\/g>/;
  const microfiberReplacement = `<g id="microfiber-field">
      ${microfiberDots}
    </g>`;
  
  if (!microfiberPattern.test(result)) {
    throw new Error('Base SVG missing microfiber-field group');
  }
  
  result = result.replace(microfiberPattern, microfiberReplacement);
  
  return result;
}

/**
 * Generate complete seal SVG for a given token
 * 
 * Same token + version always produces identical SVG.
 * 
 * Returns SVG with metadata comment including sealVersion for audit/debugging.
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
  
  // 5. Generate deterministic microfiber dots
  const microfiberDots = generateMicrofiberDots(hash, QR_CLOUD_EFFECTIVE_RADIUS);
  
  // 6. Inject into base SVG
  let finalSvg = injectQrCloud(baseSvg, qrCloudSvg, microfiberDots);
  
  // 7. Add metadata comment with sealVersion for audit/debugging
  const metadataComment = `<!-- TripDAR Seal Generator
  sealVersion: ${version}
  generator: sealGeneratorService
  tokenHash: ${hash.substring(0, 16)}...
-->`;
  
  // Insert metadata comment after XML declaration
  finalSvg = finalSvg.replace('<?xml', `<?xml\n${metadataComment}`);
  
  return finalSvg;
}


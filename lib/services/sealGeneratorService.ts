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
 * SPORE FIELD VISUAL GOAL (v5 - 3-Zone System):
 * - Zone A (0-40% of QR): Clean, no spores for scan reliability
 * - Zone B (40-70% of QR): Light transition spores
 * - Zone C (70%+): Full artistic density at outer radar
 * - Finder eyes hard-masked at 1.25× radius
 * - No visible bands or math artifacts
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  SEAL_VERSION,
  SEAL_BASE_SVG_PATH,
  SEAL_BASE_SVG_CHECKSUM,
  QR_CLOUD_EFFECTIVE_RADIUS,
  SEAL_QR_QUIET_CORE_FACTOR,
} from '@/lib/constants/seal';
import {
  generateSporeFieldPng,
  createSporeFieldImageElement,
  type SporeFieldMetadata,
} from './sealSporeFieldService';
import {
  renderDotBasedQr,
  getQrRenderingMetadata,
} from './sealQrRenderer';
import { QrRenderMode } from '@/lib/types/qr';
import type { SporeFieldConfig } from '@/lib/types/sealConfig';

/**
 * Compute deterministic hash for QR cloud generation
 */
export function computeQrCloudHash(token: string, version: string): string {
  const input = `${token}|${version}`;
  return createHash('sha256').update(input).digest('hex');
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
 * - QR code = ~500-800 circle nodes (dot-based rendering)
 * - Base SVG elements = dozens
 * - Total should be < 1000 nodes, well under the limit
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
 * Same token + version + config always produces identical SVG.
 * 
 * Returns SVG with metadata comment including sealVersion, spore field, and QR rendering info.
 * 
 * LAYERING ORDER (bottom to top):
 * 1. Spore raster (background atmosphere, with QR-aware zones)
 * 2. Radar rings (from base SVG)
 * 3. Dot-based QR (circular modules, radar-style finders)
 * 4. Sweep lines (from base SVG)
 * 5. Outer typography (from base SVG)
 * 
 * QR READABILITY:
 * - QR geometry is passed to spore field for zone-aware density
 * - Zone A (0-40% of QR radius): No spores
 * - Zone B (40-70%): Light transition
 * - Zone C (70%+): Full density
 * - Finder eyes hard-masked at 1.25× radius
 * 
 * CONFIG-DRIVEN:
 * - If config is provided, uses config.qrScale to adjust QR size
 * - If config is not provided, uses default QR_CLOUD_EFFECTIVE_RADIUS
 */
export async function generateSealSvg(
  token: string, 
  version: string = SEAL_VERSION,
  config?: SporeFieldConfig
): Promise<string> {
  // 1. Compute deterministic hash
  const hash = computeQrCloudHash(token, version);
  
  // 2. Load and validate base SVG
  const baseSvg = await loadBaseSealSvg();
  
  // 3. Calculate QR radius with optional scale from config
  // qrScale: 1.0 = default, >1.0 = larger, <1.0 = smaller
  const qrScale = config?.qrScale ?? 1.0;
  const effectiveQrRadius = QR_CLOUD_EFFECTIVE_RADIUS * qrScale;
  
  // 4. Generate DOT-BASED QR code (circles instead of squares)
  // Returns both SVG and geometry for spore field coordination
  // Apply contrast boost from config if provided
  const qrResult = await renderDotBasedQr(token, effectiveQrRadius, {
    contrastBoost: config?.moduleContrastBoost,
  });
  
  // 5. Generate RASTER spore field (PNG embedded as single <image> node)
  // CRITICAL: Pass QR geometry for zone-aware density (3-zone system)
  // Zone A: No spores (QR core)
  // Zone B: Light spores (transition)
  // Zone C: Full density (outer radar)
  let sporeFieldElement: string = '';
  let sporeFieldMetadata: SporeFieldMetadata | null = null;
  
  const sporeResult = await generateSporeFieldPng(token, version, qrResult.geometry, config);
  
  if (sporeResult) {
    // Success: single <image> element with base64 PNG
    sporeFieldElement = createSporeFieldImageElement(sporeResult.base64);
    sporeFieldMetadata = sporeResult.metadata;
  } else {
    // NO FALLBACK - log warning and continue without spore field
    console.warn(`[SealGenerator] Spore raster failed for token ${token.substring(0, 10)}..., rendered without spore field.`);
    sporeFieldElement = '<!-- Spore field generation failed - no fallback -->';
  }
  
  // 6. Apply base layer config if provided
  let processedSvg = baseSvg;
  if (config?.baseLayerConfig) {
    processedSvg = applyBaseLayerConfig(baseSvg, config.baseLayerConfig);
  }
  
  // 7. Inject all elements into base SVG
  let finalSvg = injectSealElements(processedSvg, qrResult.svg, sporeFieldElement);
  
  // 8. Add metadata comment with sealVersion, spore field, and QR rendering info
  // CRITICAL: qrRenderMode is explicitly SEAL - this is enforced by the renderer
  const qrMetadata = getQrRenderingMetadata();
  const sporeInfo = sporeFieldMetadata 
    ? `sporeField: {
    version: "${sporeFieldMetadata.version}",
    basePreset: "${sporeFieldMetadata.basePreset}",
    canvas: ${sporeFieldMetadata.canvas},
    densityCurve: "${sporeFieldMetadata.densityCurve}",
    noise: "${sporeFieldMetadata.noise}",
    edgeTaper: ${sporeFieldMetadata.edgeTaper},
    hardQuietCoreFactor: ${sporeFieldMetadata.hardQuietCoreFactor ?? SEAL_QR_QUIET_CORE_FACTOR},
    zoneASkipped: ${sporeFieldMetadata.zoneASkipped ?? 0},
    zoneBCount: ${sporeFieldMetadata.zoneBCount ?? 0},
    finderSkipped: ${sporeFieldMetadata.finderSkipped ?? 0}
  }`
    : `sporeField: "none"`;
  
  const configInfo = config 
    ? `config: {
    basePreset: "${config.basePreset}",
    qrScale: ${config.qrScale ?? 1.0},
    sporeCount: ${config.sporeCount}
  }`
    : `config: "default"`;
  
  const metadataComment = `<!-- TripDAR Seal Generator
  sealVersion: ${version}
  generator: sealGeneratorService
  tokenHash: ${hash.substring(0, 16)}...
  qrRenderMode: "${QrRenderMode.SEAL}"
  qrRenderer: {
    mode: "${qrMetadata.mode}",
    type: "dot-based",
    radius: ${effectiveQrRadius},
    radiusFactor: ${qrMetadata.radiusFactor},
    moduleShape: "${qrMetadata.moduleShape}",
    circleCount: ${qrResult.circleCount},
    finderStyle: "${qrMetadata.finderStyle}"
  }
  ${sporeInfo}
  ${configInfo}
-->`;
  
  // Insert metadata comment after XML declaration
  finalSvg = finalSvg.replace('<?xml', `<?xml\n${metadataComment}`);
  
  return finalSvg;
}

/**
 * Apply base layer configuration (colors, opacity) to the base SVG
 * 
 * This modifies the SVG elements for outer ring, text ring, and radar lines
 * based on the provided configuration.
 */
function applyBaseLayerConfig(
  svg: string, 
  config: SporeFieldConfig['baseLayerConfig']
): string {
  let result = svg;
  
  // Apply outer ring styling
  // The outer ring typically has id="outer-ring" or class="outer-ring"
  if (config.outerRing) {
    result = result.replace(
      /(<(?:circle|ellipse|path)[^>]*(?:id|class)="[^"]*outer[^"]*ring[^"]*"[^>]*)(fill|stroke)="[^"]*"/gi,
      `$1$2="${config.outerRing.color}" opacity="${config.outerRing.opacity}"`
    );
  }
  
  // Apply text ring styling
  if (config.textRing) {
    result = result.replace(
      /(<text[^>]*(?:id|class)="[^"]*text[^"]*ring[^"]*"[^>]*)(fill)="[^"]*"/gi,
      `$1$2="${config.textRing.color}" opacity="${config.textRing.opacity}"`
    );
    result = result.replace(
      /(<textPath[^>]*)(fill)="[^"]*"/gi,
      `$1$2="${config.textRing.color}" opacity="${config.textRing.opacity}"`
    );
  }
  
  // Apply radar lines styling
  if (config.radarLines) {
    result = result.replace(
      /(<(?:line|path|circle)[^>]*(?:id|class)="[^"]*radar[^"]*"[^>]*)(stroke)="[^"]*"/gi,
      `$1$2="${config.radarLines.color}" opacity="${config.radarLines.opacity}"`
    );
  }
  
  return result;
}


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
 * Default rendering order (bottom to top):
 * 1. Raster spore PNG as single <image> element (background atmosphere)
 * 2. Radar rings (SVG - from base)
 * 3. QR cloud / encoded pattern (SVG)
 * 4. Radar sweep lines (SVG - from base)
 * 5. Outer ring typography (SVG - from base)
 * 
 * With radarLinesAboveQr = true:
 * 1. Raster spore PNG
 * 2. QR cloud
 * 3. Radar rings (moved above QR)
 * 4. Radar sweep lines (moved above QR)
 * 5. Outer ring typography
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
  sporeFieldElement: string,
  radarLinesAboveQr: boolean = false,
  radarBackground?: { color: string; opacity: number }
): string {
  // First, inject the radar background (if enabled) and spore field as the background layers
  // Insert right after the opening <g id="Layer_1"> to be behind everything
  const layer1Pattern = /(<g id="Layer_1">)/;
  
  if (!layer1Pattern.test(baseSvg)) {
    throw new Error('Base SVG missing Layer_1 group');
  }
  
  // Generate radar background circle if opacity > 0
  // The inner radar area extends to r=320 (outermost radar circle in base SVG)
  // This creates a filled circle behind the spore field and QR
  let radarBackgroundElement = '';
  if (radarBackground && radarBackground.opacity > 0) {
    radarBackgroundElement = `
    <!-- Radar background fill -->
    <circle cx="500" cy="500" r="320" fill="${radarBackground.color}" opacity="${radarBackground.opacity.toFixed(2)}"/>`;
  }
  
  let result = baseSvg.replace(layer1Pattern, `$1${radarBackgroundElement}\n    ${sporeFieldElement}`);
  
  // If radarLinesAboveQr is true, extract radar elements and move them after QR
  let extractedRadarLines = '';
  if (radarLinesAboveQr) {
    // Extract radar circles (class st3) - concentric circles
    const radarCircles: string[] = [];
    result = result.replace(/<circle\s+class="st3"[^>]*\/>/g, (match) => {
      radarCircles.push(match);
      return '<!-- radar circle moved above QR -->';
    });
    
    // Extract cardinal lines (class st6) - sweep lines
    const radarLines: string[] = [];
    result = result.replace(/<line\s+class="st6"[^>]*\/>/g, (match) => {
      radarLines.push(match);
      return '<!-- radar line moved above QR -->';
    });
    
    // Combine extracted elements
    if (radarCircles.length > 0 || radarLines.length > 0) {
      extractedRadarLines = `
    <g id="radar-lines-overlay">
      ${radarCircles.join('\n      ')}
      ${radarLines.join('\n      ')}
    </g>`;
    }
  }
  
  // Replace the placeholder group with generated QR cloud
  const placeholderPattern = /<g id="qr-cloud-placeholder">[\s\S]*?<\/g>/;
  
  // If we have extracted radar lines, add them after the QR
  const qrCloudReplacement = `<g id="qr-cloud-generated">
      ${qrCloudSvg}
    </g>${extractedRadarLines}`;
  
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
  // Apply QR options from config if provided
  const qrResult = await renderDotBasedQr(token, effectiveQrRadius, {
    contrastBoost: config?.moduleContrastBoost,
    rotation: config?.qrRotation,
    dotColor: config?.qrDotColor,
    dotSize: config?.qrDotSize,
    dotShape: config?.qrDotShape,
    errorCorrection: config?.qrErrorCorrection,
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
    // Apply spore cloud opacity if configured
    const sporeCloudOpacity = config?.sporeCloudOpacity ?? 1.0;
    sporeFieldElement = createSporeFieldImageElement(sporeResult.base64, sporeCloudOpacity);
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
  // Pass radarLinesAboveQr option and radar background from config
  const radarLinesAboveQr = config?.baseLayerConfig?.radarLines?.aboveQr ?? false;
  const radarBackground = config?.baseLayerConfig?.radarBackground;
  let finalSvg = injectSealElements(processedSvg, qrResult.svg, sporeFieldElement, radarLinesAboveQr, radarBackground);
  
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
 * 
 * The base SVG (tripdar_seal_base_and_text.svg) CSS structure:
 * - Combined rule: .st5, .st3, .st4, .st6 { fill: none; stroke: #111; }
 * - st5: Outer ring (thick border, stroke-width: 14px)
 * - st3: Radar concentric circles (opacity: .6, stroke-width: 2px)
 * - st6: Cardinal direction lines (stroke-linecap: round, stroke-width: 6px)
 * - st7: Text fill color (#fff)
 * - text_outline group: Contains all text paths
 * 
 * Since stroke color is in a combined rule, we use inline style overrides.
 */
function applyBaseLayerConfig(
  svg: string, 
  config: SporeFieldConfig['baseLayerConfig']
): string {
  let result = svg;
  
  // Apply outer ring styling (st5 class - thick border circle)
  // Use inline style to override the combined CSS rule
  if (config.outerRing) {
    result = result.replace(
      /<circle\s+class="st5"/g,
      `<circle class="st5" style="stroke: ${config.outerRing.color};" opacity="${config.outerRing.opacity}"`
    );
  }
  
  // Apply text ring styling (donut-shaped background behind text - st0 fill, st2 opacity)
  // This is the dark ring that the text sits on
  if (config.textRing) {
    // The text ring is a path with class st0 inside a group with class st2
    // st0 controls fill color, st2 controls opacity
    // Modify st0 fill color
    result = result.replace(
      /(\.st0,\s*\.st1\s*\{\s*fill:\s*)#[0-9a-fA-F]+/g,
      `$1${config.textRing.color}`
    );
    // Modify st2 opacity
    result = result.replace(
      /(\.st2\s*\{\s*opacity:\s*)[0-9.]+/g,
      `$1${config.textRing.opacity}`
    );
  }
  
  // Apply text styling (the actual TRIPDAR EXPERIENCE VERIFIED text - st7 class)
  if (config.text) {
    // Modify the st7 class to include fill color and optional stroke
    const strokeWidth = config.text.strokeWidth || 0;
    const strokeColor = config.text.strokeColor || '#000000';
    
    if (strokeWidth > 0) {
      // Add stroke properties to st7 class
      result = result.replace(
        /\.st7\s*\{\s*fill:\s*#[0-9a-fA-F]+\s*;?\s*\}/g,
        `.st7 { fill: ${config.text.color}; stroke: ${strokeColor}; stroke-width: ${strokeWidth}px; paint-order: stroke fill; }`
      );
    } else {
      // Just modify the fill color
      result = result.replace(
        /(\.st7\s*\{\s*fill:\s*)#[0-9a-fA-F]+/g,
        `$1${config.text.color}`
      );
    }
    
    // Add opacity to the text_outline group
    result = result.replace(
      /(<g\s+id="text_outline">)/g,
      `<g id="text_outline" opacity="${config.text.opacity}">`
    );
  }
  
  // Apply radar lines styling (st3 for circles, st6 for lines)
  // Use inline style to override the combined CSS rule
  // Default stroke widths from base SVG: st3 = 2px, st6 = 6px
  // CRITICAL: Must use style="opacity:X" not opacity="X" attribute because
  // the CSS .st3 { opacity: .6 } rule overrides the HTML attribute
  if (config.radarLines) {
    const strokeMultiplier = config.radarLines.strokeWidth ?? 1.0;
    const circleStrokeWidth = 2 * strokeMultiplier;  // st3 default is 2px
    const lineStrokeWidth = 6 * strokeMultiplier;    // st6 default is 6px
    
    // Override stroke color, opacity, and width for radar circles (class st3)
    // Use inline style for opacity to override the CSS .st3 { opacity: .6 } rule
    result = result.replace(
      /<circle\s+class="st3"/g,
      `<circle class="st3" style="stroke: ${config.radarLines.color}; stroke-width: ${circleStrokeWidth}px; opacity: ${config.radarLines.opacity};"`
    );
    
    // Override stroke color, opacity, and width for cardinal lines (class st6)
    // st6 doesn't have CSS opacity, but use inline style for consistency
    result = result.replace(
      /<line\s+class="st6"/g,
      `<line class="st6" style="stroke: ${config.radarLines.color}; stroke-width: ${lineStrokeWidth}px; opacity: ${config.radarLines.opacity};"`
    );
  }
  
  return result;
}


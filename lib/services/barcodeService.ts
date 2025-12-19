/**
 * Barcode Service
 * 
 * Generates EAN-13 barcodes as SVG using bwip-js.
 * 
 * EAN-13 Format:
 * - 13 digits total
 * - Displayed as: X XXXXXX XXXXXX (first digit outside left, 6+6 grouped)
 * - Example: 1 234567 890913
 * 
 * SCALING RULES (Phase 3):
 * - Width scaling scales entire barcode proportionally
 * - Digit size scales with barcode WIDTH (not height)
 * - Gap between bars and digits is fixed ratio, scales with width
 * - Bar height can be adjusted independently via barHeightIn
 */

import bwipjs from 'bwip-js';
import type { BarcodeOptions } from '@/lib/types/placement';

/**
 * Generate an EAN-13 barcode as SVG markup.
 * 
 * @param ean13Code - 13-digit EAN-13 code (or 12 digits, check digit will be calculated)
 * @param options - Barcode rendering options
 * @param widthPx - Target width in pixels (for viewBox scaling)
 * @returns SVG markup string
 */
export async function generateBarcodeSvg(
  ean13Code: string,
  options: BarcodeOptions,
  widthPx: number
): Promise<string> {
  
  // Validate EAN-13 code
  const cleanCode = ean13Code.replace(/\D/g, '');
  if (cleanCode.length < 12 || cleanCode.length > 13) {
    throw new Error(`Invalid EAN-13 code: must be 12 or 13 digits, got ${cleanCode.length}`);
  }

  // Calculate dimensions based on width
  const textSizePx = widthPx * 0.08;
  const barHeightRatio = options.barHeightIn / (options.barHeightIn + options.textGapIn + options.textSizeIn);
  const totalHeightPx = widthPx * (options.barHeightIn / 1.0);
  const barHeightPx = totalHeightPx * barHeightRatio;

  try {
    // Generate barcode using bwip-js
    const svg = await bwipjs.toSVG({
      bcid: 'ean13',
      text: cleanCode,
      scale: 3,
      height: Math.max(10, barHeightPx / 3),
      includetext: true,
      textxalign: 'center',
      textsize: Math.max(8, textSizePx / 2),
      textgaps: options.textGapIn * widthPx / 3,
    });

    return svg;
  } catch (error) {
    console.error('Barcode generation error:', error);
    throw new Error(`Failed to generate barcode: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a placeholder EAN-13 barcode SVG for preview purposes.
 * Displays numbers in the correct EAN-13 format: X XXXXXX XXXXXX
 * 
 * @param widthPx - Width in viewBox/pixel units
 * @param heightPx - Height in viewBox/pixel units
 * @param barHeightPx - Height of bars only in viewBox/pixel units
 */
export function generatePlaceholderBarcodeSvg(
  widthPx: number,
  heightPx: number,
  barHeightPx: number
): string {
  const textSizePx = widthPx * 0.08;
  const textGapPx = widthPx * 0.02;
  const textY = barHeightPx + textGapPx + textSizePx * 0.85;
  
  // EAN-13 structure: 3 guard bars (start) + 42 data bars (left) + 5 center guard + 42 data bars (right) + 3 guard bars (end)
  // Total: 95 modules
  const totalModules = 95;
  const moduleWidth = widthPx * 0.85 / totalModules; // 85% of width for bars, rest for margins
  const barsStartX = widthPx * 0.1; // 10% left margin for first digit
  
  // EAN-13 encoding pattern (simplified for visual representation)
  // Start guard: 101
  // Left digits (6): each 7 modules
  // Center guard: 01010
  // Right digits (6): each 7 modules
  // End guard: 101
  
  const bars: string[] = [];
  
  // Generate realistic EAN-13 bar pattern
  // This is a simplified visual representation
  const pattern = generateEan13Pattern();
  
  let x = barsStartX;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') {
      // Determine if this is a guard bar (extends below text)
      const isGuard = i < 3 || i >= 92 || (i >= 45 && i < 50);
      const barHeight = isGuard ? barHeightPx + textGapPx : barHeightPx;
      bars.push(`<rect x="${x.toFixed(3)}" y="0" width="${moduleWidth.toFixed(3)}" height="${barHeight.toFixed(3)}" fill="#000"/>`);
    }
    x += moduleWidth;
  }
  
  // EAN-13 number display format: X XXXXXX XXXXXX
  // First digit outside left, then two groups of 6
  const placeholderCode = '1234567890913';
  const firstDigit = placeholderCode[0];
  const leftGroup = placeholderCode.slice(1, 7);
  const rightGroup = placeholderCode.slice(7, 13);
  
  // Calculate text positions
  const firstDigitX = barsStartX - textSizePx * 0.6;
  const leftGroupX = barsStartX + (3 + 21) * moduleWidth; // After start guard, center of left group
  const rightGroupX = barsStartX + (3 + 42 + 5 + 21) * moduleWidth; // After center guard, center of right group
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}" width="${widthPx}" height="${heightPx}">
  <rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="#FFFFFF"/>
  ${bars.join('\n  ')}
  <text x="${firstDigitX.toFixed(3)}" y="${textY.toFixed(3)}" text-anchor="middle" font-family="'OCR-B', 'Courier New', monospace" font-size="${textSizePx.toFixed(3)}" fill="#000">${firstDigit}</text>
  <text x="${leftGroupX.toFixed(3)}" y="${textY.toFixed(3)}" text-anchor="middle" font-family="'OCR-B', 'Courier New', monospace" font-size="${textSizePx.toFixed(3)}" letter-spacing="${(moduleWidth * 1.5).toFixed(3)}" fill="#000">${leftGroup}</text>
  <text x="${rightGroupX.toFixed(3)}" y="${textY.toFixed(3)}" text-anchor="middle" font-family="'OCR-B', 'Courier New', monospace" font-size="${textSizePx.toFixed(3)}" letter-spacing="${(moduleWidth * 1.5).toFixed(3)}" fill="#000">${rightGroup}</text>
</svg>`;
}

/**
 * Generate a simplified EAN-13 bar pattern string.
 * Returns a string of 95 '0' and '1' characters representing the bars.
 */
function generateEan13Pattern(): string {
  // Simplified EAN-13 pattern for visual representation
  // Real EAN-13 uses complex L/G/R encoding based on first digit
  // This generates a realistic-looking pattern
  
  let pattern = '';
  
  // Start guard: 101
  pattern += '101';
  
  // Left 6 digits (7 modules each = 42 total)
  // Using a mix of patterns for visual variety
  const leftPatterns = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001'];
  for (const p of leftPatterns) {
    pattern += p;
  }
  
  // Center guard: 01010
  pattern += '01010';
  
  // Right 6 digits (7 modules each = 42 total)
  const rightPatterns = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110'];
  for (const p of rightPatterns) {
    pattern += p;
  }
  
  // End guard: 101
  pattern += '101';
  
  return pattern;
}

/**
 * Generate barcode SVG with proper scaling for label injection.
 * 
 * @param ean13Code - EAN-13 code (or empty for placeholder)
 * @param options - Barcode options from element
 * @param widthVb - Width in viewBox units
 * @param heightVb - Height in viewBox units
 * @param pxPerInchX - Pixels per inch (X axis) for scaling
 */
export async function generateBarcodeForLabel(
  ean13Code: string | undefined,
  options: BarcodeOptions,
  widthVb: number,
  heightVb: number,
  pxPerInchX: number
): Promise<string> {
  // Calculate bar height in viewBox units
  const barHeightVb = options.barHeightIn * pxPerInchX;
  
  if (!ean13Code || ean13Code.length < 12) {
    // Return placeholder
    return generatePlaceholderBarcodeSvg(widthVb, heightVb, barHeightVb);
  }
  
  try {
    return await generateBarcodeSvg(ean13Code, options, widthVb);
  } catch {
    // Fallback to placeholder on error
    return generatePlaceholderBarcodeSvg(widthVb, heightVb, barHeightVb);
  }
}

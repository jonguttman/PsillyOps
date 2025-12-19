/**
 * Type declarations for bwip-js
 * 
 * bwip-js is a barcode generator that supports many symbologies.
 * This declaration covers the subset we use (SVG generation for EAN-13).
 */

declare module 'bwip-js' {
  export interface BwipOptions {
    bcid: string;           // Barcode type (e.g., 'ean13', 'code128', 'qrcode')
    text: string;           // Text to encode
    scale?: number;         // Scale factor (default 2)
    height?: number;        // Bar height in millimeters
    width?: number;         // Bar width in millimeters
    includetext?: boolean;  // Include human-readable text
    textxalign?: 'left' | 'center' | 'right' | 'justify' | 'offleft' | 'offright';
    textyalign?: 'above' | 'center' | 'below';
    textsize?: number;      // Text size in points
    textgaps?: number;      // Gap between bars and text
    textfont?: string;      // Font name
    textxoffset?: number;   // Text X offset
    textyoffset?: number;   // Text Y offset
    alttext?: string;       // Alternative text to display
    showborder?: boolean;   // Show border around barcode
    borderwidth?: number;   // Border width
    bordercolor?: string;   // Border color
    backgroundcolor?: string; // Background color
    barcolor?: string;      // Bar color
    padding?: number;       // Padding around barcode
    paddingwidth?: number;  // Horizontal padding
    paddingheight?: number; // Vertical padding
    paddingleft?: number;   // Left padding
    paddingright?: number;  // Right padding
    paddingtop?: number;    // Top padding
    paddingbottom?: number; // Bottom padding
    rotate?: 'N' | 'R' | 'L' | 'I'; // Rotation: Normal, Right, Left, Inverted
    monochrome?: boolean;   // Monochrome output
  }

  export interface ToSvgOptions extends BwipOptions {
    // SVG-specific options can be added here
  }

  /**
   * Generate barcode as SVG string
   */
  export function toSVG(options: ToSvgOptions): Promise<string>;

  /**
   * Generate barcode as PNG buffer (for Node.js)
   */
  export function toBuffer(options: BwipOptions): Promise<Buffer>;

  /**
   * Generate barcode to canvas (for browser)
   */
  export function toCanvas(canvas: HTMLCanvasElement, options: BwipOptions): Promise<void>;

  /**
   * Default export with all methods
   */
  const bwipjs: {
    toSVG: typeof toSVG;
    toBuffer: typeof toBuffer;
    toCanvas: typeof toCanvas;
  };

  export default bwipjs;
}


declare module 'bwip-js' {
  interface ToSVGOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    width?: number;
    includetext?: boolean;
    textxalign?: 'left' | 'center' | 'right' | 'offleft' | 'offright' | 'justify';
    textsize?: number;
    textyoffset?: number;
    backgroundcolor?: string;
    barcolor?: string;
    textcolor?: string;
    [key: string]: unknown;
  }

  interface BwipJs {
    toSVG(options: ToSVGOptions): Promise<string>;
    toBuffer(options: ToSVGOptions & { type?: string }): Promise<Buffer>;
  }

  const bwipjs: BwipJs;
  export default bwipjs;
}

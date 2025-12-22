# TripDAR Seal Development Log

This document chronicles the iterative development of the TripDAR Seal QR rendering system, including all approaches tried, problems encountered, and solutions implemented.

---

## Overview

The TripDAR Seal is a certification artifact that uses a stylized QR code embedded within a radar-aesthetic circular design. The goal was to create a visually distinctive seal that:
- Scans reliably on iPhone and Android at 1" diameter
- Looks organic and "embedded" rather than a square QR pasted on top
- Maintains deterministic output (same token = identical seal forever)
- Fits the TripDAR brand aesthetic (radar/spore cloud motif)

---

## Phase 1: Initial QR Cloud Concept

### Approach
- Standard square QR code generated via `qrcode` library
- Placed in center of radar design
- Surrounded by decorative "microfiber dots" in SVG

### Problems Encountered
1. **QR looked like a foreign object** - Square grid didn't match circular radar aesthetic
2. **SVG node limit errors** - Thousands of decorative dots caused "nodes limit reached" parsing failures
3. **No visual integration** - QR and background felt like separate layers

### Files Created
- `lib/services/sealGeneratorService.ts`
- `lib/constants/seal.ts`

---

## Phase 2: Raster Spore Field (PNG Approach)

### Approach
Replaced SVG dots with a raster PNG spore field:
- Generate spore field as 512×512 PNG
- Embed as single `<image>` element (1 SVG node instead of thousands)
- Use simplex noise for organic texture
- Deterministic seeding from token hash

### Implementation
```typescript
// Pure JS PNG generation (no native dependencies)
function createPngFromPixels(pixels: Uint8Array, width: number, height: number): Buffer
```

### Problems Encountered
1. **Vercel build failure** - Initial attempt used `@napi-rs/canvas` which requires native modules
2. **Spore field too small** - Only filled ~50% of radar area
3. **Center density too low** - QR bounding box remained visually obvious

### Solutions
- Replaced `@napi-rs/canvas` with pure JavaScript PNG generation using `zlib`
- Increased `MAX_RADIUS` to 97% of radar area
- Added aggressive center density boost: `density = base * (1 + coreBoost * 2.5)`

### Files Modified
- `lib/services/sealSporeFieldService.ts` (new)

---

## Phase 3: QR Size & Transparency Issues

### Problem: QR Too Small
The QR code was rendering as a tiny cluster of dots in the center.

### Root Cause
The `qrcode` library generates SVG with paths in native viewBox coordinates (0-33). When extracted and embedded into the seal SVG (1000×1000 viewBox), the scaling context was lost.

### Solution
Extract native viewBox size, calculate scale factor, apply `scale()` and `translate()` transforms:
```typescript
const scaleFactor = (targetRadius * 2) / nativeViewBoxSize;
transform="translate(${centerX}, ${centerY}) scale(${scaleFactor}) translate(-${nativeCenter}, -${nativeCenter})"
```

### Problem: QR Had Solid White Background
The spore field couldn't show through the QR's "white" areas.

### Solution
Changed QR light color from `#FFFFFF` to `#0000` (transparent):
```typescript
color: {
  dark: '#000000',
  light: '#0000'  // Transparent background
}
```

---

## Phase 4: Dot-Based QR Renderer

### Approach
Replace square QR modules with circular dots to match the spore aesthetic:
- Each dark module rendered as `<circle>` instead of `<rect>`
- Custom radar-style finder patterns (concentric circles)
- QR visually "dissolves" into spore field

### Implementation
```typescript
// sealQrRenderer.ts
export async function renderDotBasedQr(token: string, radius: number): Promise<QrRenderResult>
```

### Key Design Decisions
1. **Module shape**: Circles with radius = 42% of module size
2. **Finder patterns**: Outer ring (thick stroke) + center dot (filled)
3. **No fallback**: If rendering fails, throw error (SEAL mode only)
4. **Explicit mode separation**: `QrRenderMode.SEAL` vs `QrRenderMode.LABEL`

### Files Created
- `lib/services/sealQrRenderer.ts`
- `lib/types/qr.ts` (QrRenderMode enum)

---

## Phase 5: QR-Aware Spore Density Zones

### Problem
Spores were interfering with QR scan reliability. The spore field needed to "know" where the QR was.

### Approach: 3-Zone System
Divide the spore field into zones relative to QR radius:

| Zone | Range | Behavior |
|------|-------|----------|
| A (Core) | 0-40% of R | No spores |
| B (Transition) | 40-70% of R | Light spores, capped opacity |
| C (Outer) | 70%+ of R | Full artistic density |

### Implementation
```typescript
function getZone(distanceFromQrCenter: number, qrRadius: number): 'A' | 'B' | 'C'
function getZoneModifiers(distance, radius): { densityMod, opacityMod, angularMod }
```

### Additional Features
- **Hard Quiet Core**: 55% of QR radius is absolutely spore-free
- **Finder Eye Hard Masking**: 1.25× exclusion radius around each finder
- **Angular Modulation**: Subtle 7% directional bias for radar aesthetic

---

## Phase 6: Module-Level Spore Masking

### Problem
Even with zones, spores inside QR modules were reducing scan reliability. QR scanners require binary clarity per module.

### Approach: Precomputed Module Mask
Create a `Uint8Array` mask for O(1) lookup during spore generation:

| Mask Value | Meaning | Spore Rule |
|------------|---------|------------|
| 0 | Outside QR | Normal zone rules |
| 1 | Dark module | NO spores |
| 2 | Light module | 10% density, max 0.18 opacity |
| 3 | Finder zone | NO spores (100% sterile) |
| 4 | Edge buffer | NO spores (12% of module size) |

### Implementation
```typescript
function createModuleMask(
  qrTopLeftPx: { x: number; y: number },
  moduleSizePx: number,
  moduleCount: number,
  modules: boolean[][],
  finderExclusions: { centerX, centerY, exclusionRadius }[]
): Uint8Array
```

### QrGeometry Interface Extended
```typescript
interface QrGeometry {
  // ... existing fields
  modules: boolean[][];      // Full QR matrix
  moduleCount: number;       // Modules per side
  moduleSizePx: number;      // Module size in PNG space
  qrTopLeftPx: { x, y };     // QR position in PNG space
}
```

---

## Phase 7: Particle Size Convergence

### Problem
The spore field looked like "dust" or "static" - a completely different visual language from the QR dots. The QR felt like it was floating on top of noise instead of emerging from it.

### Root Cause
- Spore radius: 0.4-1.4px (absolute, tiny)
- QR dot radius: ~3-4px (much larger)
- This scale mismatch made them feel like separate systems

### Solution: Tie Spore Size to QR Dot Size
```typescript
const qrDotRadiusPx = moduleSizePx * 0.42;  // Canonical particle size
const minSporeRadius = qrDotRadiusPx * 0.55; // 55% of QR dot
const maxSporeRadius = qrDotRadiusPx * 0.85; // 85% of QR dot
```

### Additional Changes
1. **Reduced particle count**: 40% of previous (32,000 vs 80,000)
2. **Opacity-based variation**: 0.22-0.55 range with subtle jitter
3. **Minimal size jitter**: ±10% instead of large variance

### Expected Result
- QR and spores feel like the same "ink"
- QR reads as a "denser constellation" of identical particles
- No dust/static texture
- Better scan reliability

---

## Phase 8: Seal Tuner & Print Calibration System

### Problem
Iterating on seal visual parameters required code changes, rebuilds, and manual testing. No way to quickly experiment with different configurations or test print output at various sizes.

### Solution: Interactive Tuner Panel
Built a comprehensive tuning UI at `/ops/seals` with:
- **Live SVG preview** using fixed token `TUNER_PREVIEW_001`
- **Preset system** with 4 algorithm variants (dot-zones, zone-system, module-masked, material-unified)
- **Dynamic controls** that enable/disable based on selected preset
- **Real-time parameter adjustment** with immediate visual feedback

### Implementation
```typescript
// SporeFieldConfig - complete configuration interface
interface SporeFieldConfig {
  basePreset: BasePresetId;
  sporeCount: number;
  minOpacity: number;
  maxOpacity: number;
  zoneAEnd: number;
  zoneBEnd: number;
  quietCoreFactor?: number;
  edgeBufferFactor?: number;
  lightModuleDensity?: number;
  lightModuleMaxOpacity?: number;
  finderExclusionMultiplier?: number;
  sporeRadiusMinFactor?: number;
  sporeRadiusMaxFactor?: number;
  moduleContrastBoost?: number;
  qrScale?: number;
  baseLayerConfig: BaseLayerConfig;
}
```

### Key Features
1. **Preset Buttons**: Named presets (not numbered) with descriptions
2. **Hover Tooltips**: Explain each control's effect
3. **QR Scale Slider**: Adjust QR size from 50% to 150% of default
4. **Base Layer Controls**: Color/opacity for outer ring, text ring, text, and radar lines
5. **Export PDF**: Multi-size export with cut guides

### Files Created
- `lib/types/sealConfig.ts` - Configuration type definitions
- `lib/constants/sealPresets.ts` - Preset definitions and defaults
- `components/seals/SealTunerPanel.tsx` - Main tuner UI component
- `app/api/seals/tuner/preview/route.ts` - Preview generation API
- `app/api/seals/tuner/export/route.ts` - PDF export API

---

## Phase 9: Base Layer Visual Controls

### Problem
The base SVG elements (outer ring, text, radar lines) were hardcoded. Users needed to adjust these for different print contexts and brand variations.

### Solution: BaseLayerConfig System
Added comprehensive controls for all base SVG elements:

```typescript
interface BaseLayerConfig {
  outerRing: {
    color: string;    // Hex color
    opacity: number;  // 0-1
  };
  textRing: {
    color: string;
    opacity: number;
  };
  text: {
    color: string;
    opacity: number;
    strokeWidth: number;  // Border thickness (0 = no border)
    strokeColor: string;  // Border color
  };
  radarLines: {
    color: string;
    opacity: number;
    aboveQr: boolean;     // Render above or below QR
  };
}
```

### Implementation Details

#### Text Styling
- Fill color via CSS class modification (`.st7`)
- Optional stroke/border with `paint-order: stroke fill` for clean edges
- Opacity via group attribute on `text_outline`

#### Radar Lines Layer Control
When `aboveQr: true`:
1. Extract radar circles (`.st3`) and cardinal lines (`.st6`) from original positions
2. Create placeholder comments in original locations
3. Inject extracted elements in new `radar-lines-overlay` group after QR

```typescript
function injectSealElements(
  baseSvg: string, 
  qrCloudSvg: string, 
  sporeFieldElement: string,
  radarLinesAboveQr: boolean = false
): string
```

### UI Controls Added
- **Text Border**: Slider (0-3px) with conditional color picker
- **Radar Lines Above QR**: Toggle checkbox
- **Additional Export Sizes**: 0.5" and 0.75" options

---

## Phase 10: UI/UX Fixes (Current)

### Problems Encountered
1. **SVG Preview Rendering as XML** - Raw SVG string displayed instead of rendered image
2. **Tooltips Off-Screen** - Positioned to the right, clipped by viewport
3. **Preview Not Sticky** - Scrolled with controls instead of staying visible

### Solutions

#### SVG Preview
Changed from `dangerouslySetInnerHTML` to blob URL approach:
```typescript
const [previewUrl, setPreviewUrl] = useState<string | null>(null);

// Strip XML declaration, create blob URL
const cleanSvg = svgString.replace(/<\?xml[^?]*\?>/g, '');
const blob = new Blob([cleanSvg], { type: 'image/svg+xml' });
const url = URL.createObjectURL(blob);
setPreviewUrl(url);

// Render as <img>
<img src={previewUrl} alt="Seal Preview" />
```

#### Tooltip Positioning
- Changed from `left-full ml-2` to `right-full mr-2`
- Used `position: fixed` with `getBoundingClientRect()` for accurate placement
- Tooltips now render to the LEFT of triggers, above other content

#### Sticky Preview
Restructured layout:
- Preview section: `position: sticky; top: 0`
- Controls section: Scrolls independently
- Full height utilization with proper overflow handling

### Files Modified
- `components/seals/SealTunerPanel.tsx`

---

## Constants Reference

### Seal Geometry (`lib/constants/seal.ts`)
```typescript
SEAL_VERSION = 'seal_v1'
INNER_RADAR_DIAMETER = 500  // SVG units
QR_RADIUS_FACTOR = 0.85     // 85% of inner radar
QR_CLOUD_EFFECTIVE_RADIUS = 212  // SVG units
SEAL_QR_QUIET_CORE_FACTOR = 0.55  // 55% of QR radius
QR_ERROR_CORRECTION_LEVEL = 'M'   // 15% error correction
```

### Spore Field (`lib/services/sealSporeFieldService.ts`)
```typescript
PNG_SIZE = 512
SVG_TO_PNG_SCALE = 0.512
ZONE_A_END = 0.40
ZONE_B_END = 0.70
FINDER_MASK_MULTIPLIER = 1.25
MODULE_EDGE_BUFFER_FACTOR = 0.12
LIGHT_MODULE_DENSITY_FACTOR = 0.10
SPORE_RADIUS_MIN_FACTOR = 0.55
SPORE_RADIUS_MAX_FACTOR = 0.85
SPORE_COUNT_REDUCTION = 0.40
```

### QR Renderer (`lib/services/sealQrRenderer.ts`)
```typescript
QR_CLOUD_CENTER_X = 500
QR_CLOUD_CENTER_Y = 500
QR_RADIUS_FACTOR = 0.68
MODULE_RADIUS_FACTOR = 0.42
FINDER_SIZE = 7  // Standard 7×7 modules
```

### Base Layer Defaults (`lib/constants/sealPresets.ts`)
```typescript
DEFAULT_BASE_LAYER = {
  outerRing: { color: '#000000', opacity: 1.0 },
  textRing: { color: '#000000', opacity: 0.9 },
  text: { color: '#ffffff', opacity: 1.0, strokeWidth: 0, strokeColor: '#000000' },
  radarLines: { color: '#000000', opacity: 0.6, aboveQr: false }
}
```

### Export Sizes
```typescript
AVAILABLE_SIZES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5]  // inches
```

---

## Version History

| Version | Description |
|---------|-------------|
| v1 | Initial SVG dots (failed - node limit) |
| v2 | Raster PNG spore field |
| v3 | Increased spore radius to 97% |
| v4 | Aggressive center density boost |
| v5 | Dot-based QR renderer |
| v6 | 3-zone system + hard quiet core |
| v7 | Module-level masking |
| v8 | Particle size convergence |
| v9 | Seal Tuner & Print Calibration System |
| v10 | Base layer controls + UI fixes (current) |

---

## Key Lessons Learned

1. **Native dependencies don't work on Vercel** - Use pure JS implementations
2. **SVG has node limits** - Use raster for dense particle fields
3. **Visual unity matters** - Particles must feel like the same "material"
4. **QR scanners need binary clarity** - Respect module boundaries
5. **Determinism is non-negotiable** - Same input = same output forever
6. **Separation of concerns** - SEAL mode vs LABEL mode must be explicit
7. **Interactive tuning beats code iteration** - Build calibration tools early
8. **CSS class targeting is fragile** - Use inline styles for reliable overrides
9. **SVG rendering in React** - Use blob URLs with `<img>` instead of `dangerouslySetInnerHTML`
10. **Fixed positioning for tooltips** - Escape overflow containers with `position: fixed`

---

## File Structure

```
lib/
├── constants/
│   ├── seal.ts                    # Seal geometry constants
│   └── sealPresets.ts             # Preset definitions and defaults
├── services/
│   ├── sealGeneratorService.ts    # Main seal SVG orchestrator
│   ├── sealQrRenderer.ts          # Dot-based QR renderer (SEAL mode)
│   ├── sealSporeFieldService.ts   # Raster spore field generator
│   └── labelService.ts            # Square QR renderer (LABEL mode)
├── types/
│   ├── qr.ts                      # QrRenderMode enum
│   └── sealConfig.ts              # SporeFieldConfig, BaseLayerConfig types
components/
└── seals/
    └── SealTunerPanel.tsx         # Interactive tuning UI
app/
├── ops/seals/
│   ├── page.tsx                   # Seal generation page
│   └── SealsClient.tsx            # Client component with tuner
└── api/seals/tuner/
    ├── preview/route.ts           # Preview generation API
    ├── export/route.ts            # PDF export API
    └── presets/route.ts           # Preset management API
public/
└── tripdar_seal_base_and_text.svg # Base template with text rings
```

---

## Future Considerations

1. **Debug overlay mode** - `?debug=1` to visualize zones and masks
2. **Scan reliability testing** - Automated tests at various print sizes
3. **Color variants** - Different ink colors for premium seals
4. **Animation** - Subtle radar sweep for digital display (out of scope)
5. **Preset sharing** - Export/import preset configurations
6. **A/B testing** - Compare scan reliability across configurations
7. **Print calibration profiles** - Per-printer adjustments

---

*Last updated: December 22, 2024*
*Current version: v10-base-layer-controls*


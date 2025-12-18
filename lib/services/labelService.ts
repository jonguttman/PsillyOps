// LABEL SERVICE - Template management, versioning, and element injection
// SVG is the source of truth - Unified Placement Model
//
// DESIGN LAWS:
// - Geometry is geometry (xIn, yIn, widthIn, heightIn)
// - Semantics are semantics (barcode options)
// - Rotation is visual only (does not affect placement values)
// - Movement is always label-relative (up = up, regardless of rotation)
// - All measurements in physical inches
// - No scale+offset models, no placeholder-relative math

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { getLabelStorage, validateSvgPlaceholder, isAllowedFileType, getFileExtension } from './labelStorage';
import { ActivityEntity, LabelEntityType } from '@prisma/client';
import QRCode from 'qrcode';
import { 
  PlaceableElement, 
  validateElements, 
  createDefaultQrElement,
  type Placement 
} from '@/lib/types/placement';

// ========================================
// TYPES
// ========================================

export interface QRPayload {
  type: 'PRODUCT' | 'BATCH' | 'INVENTORY';
  id: string;
  code: string;  // SKU, batch code, lot number
  url: string;   // Full PsillyOps URL
}

export interface CreateTemplateParams {
  name: string;
  entityType: LabelEntityType;
  userId?: string;
}

export interface CreateVersionParams {
  templateId: string;
  version: string;
  file: Buffer;
  fileName: string;
  qrTemplate?: string;
  notes?: string;
  userId?: string;
}

export interface RenderLabelParams {
  versionId: string;
  qrPayload: QRPayload;
}

// ========================================
// LETTER SHEET CONSTANTS
// ========================================

const LETTER_WIDTH_IN = 8.5;
const LETTER_HEIGHT_IN = 11;
const LETTER_MARGIN_IN = 0.25;
const LETTER_USABLE_WIDTH_IN = LETTER_WIDTH_IN - 2 * LETTER_MARGIN_IN; // 8.0
const LETTER_USABLE_HEIGHT_IN = LETTER_HEIGHT_IN - 2 * LETTER_MARGIN_IN; // 10.5

// Default QR placement constants
const DEFAULT_QR_SIZE_LARGE_IN = 0.75; // For labels >= 2in wide
const DEFAULT_QR_SIZE_SMALL_IN = 0.5;  // For labels < 2in wide
const DEFAULT_QR_MARGIN_IN = 0.125;

export type RenderMode = 'embedded' | 'token';

export interface RenderLabelsParams {
  mode: RenderMode;
  versionId: string;
  entityType: LabelEntityType;
  entityId: string;
  quantity: number;
  userId?: string;
  // For embedded mode
  qrPayload?: QRPayload;
  // For token mode (tokens are created internally)
  baseUrl?: string;
}

export interface RenderLabelsResult {
  svgs: string[];
  entityType: LabelEntityType;
  entityId: string;
  entityCode: string;
  versionId: string;
  // Only present in token mode
  tokens?: Array<{
    id: string;
    token: string;
    url: string;
  }>;
}

export interface LetterSheetLayoutMeta {
  perSheet: number;
  columns: number;
  rows: number;
  rotationUsed: boolean;
  totalSheets: number;
  labelWidthIn: number;
  labelHeightIn: number;
}

// ========================================
// TEMPLATE CRUD
// ========================================

/**
 * List all label templates, optionally filtered by entity type
 */
export async function listTemplates(entityType?: LabelEntityType) {
  const where = entityType ? { entityType } : {};
  
  return prisma.labelTemplate.findMany({
    where,
    include: {
      versions: {
        orderBy: { createdAt: 'desc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Get a single template with all versions
 */
export async function getTemplate(templateId: string) {
  const template = await prisma.labelTemplate.findUnique({
    where: { id: templateId },
    include: {
      versions: {
        orderBy: { createdAt: 'desc' }
      }
    }
  });
  
  if (!template) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label template not found');
  }
  
  return template;
}

/**
 * Create a new label template
 */
export async function createTemplate(params: CreateTemplateParams) {
  const { name, entityType, userId } = params;
  
  const template = await prisma.labelTemplate.create({
    data: {
      name,
      entityType
    }
  });
  
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: template.id,
    action: 'label_template_created',
    userId,
    summary: `Created label template "${name}" for ${entityType}`,
    metadata: { name, entityType }
  });
  
  return template;
}

/**
 * Update template name
 */
export async function updateTemplate(templateId: string, name: string, userId?: string) {
  const existing = await prisma.labelTemplate.findUnique({
    where: { id: templateId }
  });
  
  if (!existing) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label template not found');
  }
  
  const template = await prisma.labelTemplate.update({
    where: { id: templateId },
    data: { name }
  });
  
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: templateId,
    action: 'label_template_updated',
    userId,
    summary: `Updated label template name to "${name}"`,
    before: { name: existing.name },
    after: { name }
  });
  
  return template;
}

// ========================================
// VERSION MANAGEMENT
// ========================================

/**
 * Create a new version of a label template
 * File upload is coupled to version creation (no standalone upload)
 */
export async function createVersion(params: CreateVersionParams) {
  const { templateId, version, file, fileName, qrTemplate, notes, userId } = params;
  
  // Verify template exists
  const template = await prisma.labelTemplate.findUnique({
    where: { id: templateId }
  });
  
  if (!template) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label template not found');
  }
  
  // Check if version already exists
  const existingVersion = await prisma.labelTemplateVersion.findUnique({
    where: {
      templateId_version: { templateId, version }
    }
  });
  
  if (existingVersion) {
    throw new AppError(ErrorCodes.CONFLICT, `Version ${version} already exists for this template`);
  }
  
  // Validate file type
  const ext = getFileExtension(fileName);
  if (!isAllowedFileType(ext)) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 'Only SVG and PDF files are allowed');
  }
  
  // For SVG files, check placeholder (informational only - we handle missing placeholders)
  if (ext === '.svg') {
    const svgContent = file.toString('utf-8');
    if (!validateSvgPlaceholder(svgContent)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[labelService] SVG missing qr-placeholder for template ${templateId} - default placement will be used`);
      }
    }
  }
  
  // Save file to storage
  const storage = getLabelStorage();
  const fileUrl = await storage.save(templateId, version, file, ext);
  
  // Create version record (elements starts as Prisma.DbNull - will be initialized on first edit)
  const templateVersion = await prisma.labelTemplateVersion.create({
    data: {
      templateId,
      version,
      fileUrl,
      qrTemplate,
      notes,
      isActive: false
      // elements defaults to null via schema
    }
  });
  
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: templateId,
    action: 'label_version_uploaded',
    userId,
    summary: `Uploaded version ${version} of label template "${template.name}"`,
    metadata: {
      versionId: templateVersion.id,
      version,
      fileUrl,
      qrTemplate,
      notes
    }
  });
  
  return templateVersion;
}

/**
 * Activate a label version (deactivates all others for the template)
 */
export async function activateVersion(versionId: string, userId?: string) {
  const version = await prisma.labelTemplateVersion.findUnique({
    where: { id: versionId },
    include: { template: true }
  });
  
  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }
  
  // Deactivate all versions for this template
  await prisma.labelTemplateVersion.updateMany({
    where: { templateId: version.templateId },
    data: { isActive: false }
  });
  
  // Activate the selected version
  const activated = await prisma.labelTemplateVersion.update({
    where: { id: versionId },
    data: { isActive: true }
  });
  
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: version.templateId,
    action: 'label_version_activated',
    userId,
    summary: `Activated version ${version.version} of label template "${version.template.name}"`,
    metadata: {
      versionId,
      version: version.version,
      templateName: version.template.name
    }
  });
  
  return activated;
}

/**
 * Deactivate a label version
 */
export async function deactivateVersion(versionId: string, userId?: string) {
  const version = await prisma.labelTemplateVersion.findUnique({
    where: { id: versionId },
    include: { template: true }
  });
  
  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }
  
  const deactivated = await prisma.labelTemplateVersion.update({
    where: { id: versionId },
    data: { isActive: false }
  });
  
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: version.templateId,
    action: 'label_version_deactivated',
    userId,
    summary: `Deactivated version ${version.version} of label template "${version.template.name}"`,
    metadata: {
      versionId,
      version: version.version
    }
  });
  
  return deactivated;
}

/**
 * Get the active label template version for an entity type
 */
export async function getActiveLabelTemplate(entityType: LabelEntityType) {
  const template = await prisma.labelTemplate.findFirst({
    where: { entityType },
    include: {
      versions: {
        where: { isActive: true },
        take: 1
      }
    }
  });
  
  if (!template || template.versions.length === 0) {
    return null;
  }
  
  return {
    template,
    activeVersion: template.versions[0]
  };
}

/**
 * Get all active versions across all templates for an entity type
 */
export async function getActiveTemplatesForEntityType(entityType: LabelEntityType) {
  return prisma.labelTemplate.findMany({
    where: { entityType },
    include: {
      versions: {
        where: { isActive: true }
      }
    }
  });
}

/**
 * Update elements array for a label version
 * This is the ONLY way to update placement - no scale/offset fields
 */
export async function updateVersionElements(
  versionId: string,
  elements: PlaceableElement[],
  userId?: string
) {
  const version = await prisma.labelTemplateVersion.findUnique({
    where: { id: versionId },
    include: { template: true }
  });

  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }

  // Get label dimensions for validation
  const storage = getLabelStorage();
  const fileBuffer = await storage.load(version.fileUrl);
  const svgContent = fileBuffer.toString('utf-8');
  const { widthIn: labelWidthIn, heightIn: labelHeightIn } = getSvgPhysicalSizeInches(svgContent);

  // Validate elements
  const errors = validateElements(elements, labelWidthIn, labelHeightIn);
  if (errors.length > 0) {
    throw new AppError(ErrorCodes.INVALID_INPUT, `Invalid elements: ${errors.join('; ')}`);
  }

  const before = version.elements;

  // Update elements
  const updated = await prisma.labelTemplateVersion.update({
    where: { id: versionId },
    data: {
      elements: elements as any, // Prisma Json type
      updatedAt: new Date()
    },
    include: { template: true }
  });

  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: version.templateId,
    action: 'label_elements_updated',
    userId,
    summary: `Updated ${elements.length} element(s) for version ${version.version} of "${version.template.name}"`,
    before: { elements: before },
    after: { elements },
    metadata: {
      versionId,
      version: version.version,
      templateName: version.template.name,
      elementCount: elements.length
    }
  });

  return updated;
}

/**
 * Get a label version by ID
 */
export async function getLabelVersion(versionId: string) {
  const version = await prisma.labelTemplateVersion.findUnique({
    where: { id: versionId },
    include: { template: true }
  });

  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }

  return version;
}

// ========================================
// LABEL RENDERING
// ========================================

/**
 * Render a label SVG with QR code injection
 * Uses unified placement model - elements array with absolute inch positions
 */
export async function renderLabelSvg(params: RenderLabelParams): Promise<string> {
  const { versionId, qrPayload } = params;
  
  const version = await prisma.labelTemplateVersion.findUnique({
    where: { id: versionId },
    include: { template: true }
  });
  
  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }
  
  // Load the SVG file
  const storage = getLabelStorage();
  const fileBuffer = await storage.load(version.fileUrl);
  let svgContent = fileBuffer.toString('utf-8');
  
  // Apply label size override if set
  if (version.labelWidthIn && version.labelHeightIn) {
    const { widthIn: nativeWidth, heightIn: nativeHeight } = getSvgPhysicalSizeInches(svgContent);
    svgContent = applyLabelSizeOverride(svgContent, nativeWidth, nativeHeight, version.labelWidthIn, version.labelHeightIn);
  }
  
  // Get elements (or create default if none exist)
  const elements = getElementsOrDefault(version.elements as PlaceableElement[] | null, svgContent);
  
  // Generate QR code as SVG markup
  const qrSvg = await generateQrSvgFromUrl(qrPayload.url);
  
  // Inject elements at absolute positions
  svgContent = injectElements(svgContent, elements, qrSvg);
  
  return svgContent;
}

/**
 * Render a label using the active version for an entity type
 */
export async function renderActiveLabelSvg(
  entityType: LabelEntityType,
  qrPayload: QRPayload
): Promise<string | null> {
  const active = await getActiveLabelTemplate(entityType);
  
  if (!active) {
    return null;
  }
  
  return renderLabelSvg({
    versionId: active.activeVersion.id,
    qrPayload
  });
}

/**
 * Log a label print event
 */
export async function logLabelPrinted(params: {
  versionId: string;
  entityType: string;
  entityId: string;
  entityCode: string;
  quantity: number;
  userId?: string;
}) {
  const { versionId, entityType, entityId, entityCode, quantity, userId } = params;
  
  const version = await prisma.labelTemplateVersion.findUnique({
    where: { id: versionId },
    include: { template: true }
  });
  
  if (!version) return;
  
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: version.templateId,
    action: 'labels_printed',
    userId,
    summary: `Printed ${quantity} label(s) for ${entityType} ${entityCode}`,
    metadata: {
      versionId,
      version: version.version,
      templateName: version.template.name,
      entityType,
      entityId,
      entityCode,
      quantity
    },
    tags: ['print']
  });
}

// ========================================
// TOKEN-BASED LABEL RENDERING
// ========================================

export interface RenderLabelWithTokenParams {
  versionId: string;
  token: string;
  baseUrl: string;
}

/**
 * Render a label SVG with a token-based QR code
 */
export async function renderLabelWithToken(params: RenderLabelWithTokenParams): Promise<string> {
  const { versionId, token, baseUrl } = params;
  
  const version = await prisma.labelTemplateVersion.findUnique({
    where: { id: versionId },
    include: { template: true }
  });
  
  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }
  
  // Load the SVG file
  const storage = getLabelStorage();
  const fileBuffer = await storage.load(version.fileUrl);
  let svgContent = fileBuffer.toString('utf-8');
  
  // Apply label size override if set
  if (version.labelWidthIn && version.labelHeightIn) {
    const { widthIn: nativeWidth, heightIn: nativeHeight } = getSvgPhysicalSizeInches(svgContent);
    svgContent = applyLabelSizeOverride(svgContent, nativeWidth, nativeHeight, version.labelWidthIn, version.labelHeightIn);
  }
  
  // Get elements (or create default if none exist)
  const elements = getElementsOrDefault(version.elements as PlaceableElement[] | null, svgContent);
  
  // Build the token URL and generate QR
  const tokenUrl = `${baseUrl}/qr/${token}`;
  const qrSvg = await generateQrSvgFromUrl(tokenUrl);
  
  // Inject elements
  svgContent = injectElements(svgContent, elements, qrSvg);
  
  return svgContent;
}

/**
 * Render multiple labels with unique tokens
 */
export async function renderLabelsWithTokens(params: {
  versionId: string;
  tokens: string[];
  baseUrl: string;
}): Promise<string[]> {
  const { versionId, tokens, baseUrl } = params;
  
  const version = await prisma.labelTemplateVersion.findUnique({
    where: { id: versionId },
    include: { template: true }
  });
  
  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }
  
  // Load the SVG file once
  const storage = getLabelStorage();
  const fileBuffer = await storage.load(version.fileUrl);
  let svgTemplate = fileBuffer.toString('utf-8');
  
  // Apply label size override if set
  if (version.labelWidthIn && version.labelHeightIn) {
    const { widthIn: nativeWidth, heightIn: nativeHeight } = getSvgPhysicalSizeInches(svgTemplate);
    svgTemplate = applyLabelSizeOverride(svgTemplate, nativeWidth, nativeHeight, version.labelWidthIn, version.labelHeightIn);
  }
  
  // Get elements (or create default if none exist)
  const elements = getElementsOrDefault(version.elements as PlaceableElement[] | null, svgTemplate);
  
  // Render each label with its unique token
  const svgs: string[] = [];
  for (const token of tokens) {
    const tokenUrl = `${baseUrl}/qr/${token}`;
    const qrSvg = await generateQrSvgFromUrl(tokenUrl);
    const svgContent = injectElements(svgTemplate, elements, qrSvg);
    svgs.push(svgContent);
  }
  
  return svgs;
}

/**
 * Generate a QR code SVG markup from a URL
 */
async function generateQrSvgFromUrl(url: string): Promise<string> {
  return await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'L',
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
}

// ========================================
// SHARED RENDER HELPER
// ========================================

/**
 * Shared helper for rendering labels in different modes
 */
export async function renderLabelsShared(params: RenderLabelsParams): Promise<RenderLabelsResult> {
  const { mode, versionId, entityType, entityId, quantity, userId, qrPayload, baseUrl } = params;

  const version = await prisma.labelTemplateVersion.findUnique({
    where: { id: versionId },
    include: { template: true }
  });

  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }

  // Get entity code
  const entityCode = await getEntityCode(entityType, entityId);

  // Load the SVG template
  const storage = getLabelStorage();
  const fileBuffer = await storage.load(version.fileUrl);
  let svgTemplate = fileBuffer.toString('utf-8');
  
  // Apply label size override if set
  if (version.labelWidthIn && version.labelHeightIn) {
    const { widthIn: nativeWidth, heightIn: nativeHeight } = getSvgPhysicalSizeInches(svgTemplate);
    svgTemplate = applyLabelSizeOverride(svgTemplate, nativeWidth, nativeHeight, version.labelWidthIn, version.labelHeightIn);
  }

  // Get elements (or create default if none exist)
  const elements = getElementsOrDefault(version.elements as PlaceableElement[] | null, svgTemplate);

  if (mode === 'embedded') {
    if (!qrPayload) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'qrPayload required for embedded mode');
    }

    const qrSvg = await generateQrSvgFromUrl(qrPayload.url);
    const svg = injectElements(svgTemplate, elements, qrSvg);

    // For embedded mode, duplicate SVG for quantity (all identical)
    const svgs = Array(quantity).fill(svg);

    return {
      svgs,
      entityType,
      entityId,
      entityCode,
      versionId
    };
  } else {
    // Token mode: Create unique tokens and render each label
    if (!baseUrl) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'baseUrl required for token mode');
    }

    const { createTokenBatch, buildTokenUrl } = await import('./qrTokenService');

    const createdTokens = await createTokenBatch({
      entityType,
      entityId,
      versionId,
      quantity,
      userId
    });

    const svgs: string[] = [];
    for (const token of createdTokens) {
      const tokenUrl = `${baseUrl}/qr/${token.token}`;
      const qrSvg = await generateQrSvgFromUrl(tokenUrl);
      const svgContent = injectElements(svgTemplate, elements, qrSvg);
      svgs.push(svgContent);
    }

    return {
      svgs,
      entityType,
      entityId,
      entityCode,
      versionId,
      tokens: createdTokens.map(t => ({
        id: t.id,
        token: t.token,
        url: buildTokenUrl(t.token, baseUrl)
      }))
    };
  }
}

/**
 * Get the display code for an entity
 */
async function getEntityCode(entityType: LabelEntityType, entityId: string): Promise<string> {
  switch (entityType) {
    case 'BATCH': {
      const batch = await prisma.batch.findUnique({ where: { id: entityId } });
      if (!batch) throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
      return batch.batchCode;
    }
    case 'PRODUCT': {
      const product = await prisma.product.findUnique({ where: { id: entityId } });
      if (!product) throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
      return product.sku;
    }
    case 'INVENTORY': {
      const inventory = await prisma.inventoryItem.findUnique({ where: { id: entityId } });
      if (!inventory) throw new AppError(ErrorCodes.NOT_FOUND, 'Inventory item not found');
      return inventory.lotNumber || inventory.id.slice(-8);
    }
    case 'CUSTOM':
      return entityId.slice(-8);
    default:
      return entityId.slice(-8);
  }
}

// ========================================
// ELEMENT INJECTION (UNIFIED PLACEMENT)
// ========================================

/**
 * Inject placeable elements into SVG at absolute inch positions.
 * 
 * CRITICAL: All inch-to-SVG conversions go through getSvgPhysicalSizeInches
 * and extractViewBox. No hardcoded DPI assumptions.
 * 
 * Rotation uses translate-rotate-translate pattern for cross-renderer consistency.
 */
function injectElements(
  svg: string,
  elements: PlaceableElement[],
  qrSvgContent: string
): string {
  if (elements.length === 0) {
    return svg;
  }

  // SINGLE SOURCE OF TRUTH for coordinate conversion
  const { widthIn, heightIn } = getSvgPhysicalSizeInches(svg);
  const viewBox = extractViewBox(svg);
  
  let vbWidth: number;
  let vbHeight: number;
  
  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(parseFloat);
    if (parts.length >= 4) {
      vbWidth = parts[2];
      vbHeight = parts[3];
    } else {
      // Fallback: assume 96 DPI
      vbWidth = widthIn * 96;
      vbHeight = heightIn * 96;
    }
  } else {
    // No viewBox: assume 96 DPI
    vbWidth = widthIn * 96;
    vbHeight = heightIn * 96;
  }

  const pxPerInchX = vbWidth / widthIn;
  const pxPerInchY = vbHeight / heightIn;

  let injectedContent = '';

  for (const el of elements) {
    const x = el.placement.xIn * pxPerInchX;
    const y = el.placement.yIn * pxPerInchY;
    const w = el.placement.widthIn * pxPerInchX;
    const h = el.placement.heightIn * pxPerInchY;
    const cx = x + w / 2;
    const cy = y + h / 2;

    // Rotation: translate-rotate-translate pattern for cross-renderer consistency
    const rotateAttr = el.placement.rotation !== 0
      ? `transform="translate(${cx.toFixed(3)}, ${cy.toFixed(3)}) rotate(${el.placement.rotation}) translate(${(-cx).toFixed(3)}, ${(-cy).toFixed(3)})"`
      : '';

    if (el.type === 'QR') {
      // Extract viewBox from QR SVG for proper scaling
      const qrVbMatch = qrSvgContent.match(/\bviewBox="0 0 ([0-9.]+) ([0-9.]+)"/i);
      const qrVbSize = qrVbMatch ? parseFloat(qrVbMatch[1]) : 0;
      const qrInner = stripOuterSvg(qrSvgContent);

      injectedContent += `
  <g ${rotateAttr}>
    <svg x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}"${qrVbSize ? ` viewBox="0 0 ${qrVbSize} ${qrVbSize}"` : ''} shape-rendering="crispEdges">
      ${qrInner}
    </svg>
  </g>`;
    }
    // BARCODE injection will be added in Phase 2
  }

  // Insert before closing </svg> tag
  return svg.replace(/<\/svg>\s*$/i, `${injectedContent}\n</svg>`);
}

/**
 * Get elements from version or create default placement
 * 
 * Initial placement logic (one-time only):
 * 1. Check SVG for id="qr-placeholder" element
 * 2. If found: extract position, create default QR element at that location
 * 3. If not found: use default placement at bottom-right
 * 
 * After save, placeholder is ignored forever.
 */
function getElementsOrDefault(
  storedElements: PlaceableElement[] | null,
  svgContent: string
): PlaceableElement[] {
  // If elements exist, use them
  if (storedElements && storedElements.length > 0) {
    return storedElements;
  }

  // Get label dimensions
  let widthIn: number;
  let heightIn: number;
  try {
    const size = getSvgPhysicalSizeInches(svgContent);
    widthIn = size.widthIn;
    heightIn = size.heightIn;
  } catch {
    widthIn = 2;
    heightIn = 2;
  }

  // Try to extract placeholder position for initial placement
  const placeholderBox = extractPlaceholderBox(svgContent);
  
  if (placeholderBox) {
    // Convert placeholder position from SVG units to inches
    const viewBox = extractViewBox(svgContent);
    let pxPerInchX = 96;
    let pxPerInchY = 96;
    
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(parseFloat);
      if (parts.length >= 4) {
        pxPerInchX = parts[2] / widthIn;
        pxPerInchY = parts[3] / heightIn;
      }
    }
    
    const xIn = placeholderBox.x / pxPerInchX;
    const yIn = placeholderBox.y / pxPerInchY;
    const sizeIn = Math.min(placeholderBox.width / pxPerInchX, placeholderBox.height / pxPerInchY);
    
    return [createDefaultQrElement(xIn, yIn, sizeIn)];
  }

  // No placeholder: use default placement (bottom-right corner)
  const qrSize = widthIn >= 2 ? DEFAULT_QR_SIZE_LARGE_IN : DEFAULT_QR_SIZE_SMALL_IN;
  const margin = DEFAULT_QR_MARGIN_IN;
  const xIn = widthIn - qrSize - margin;
  const yIn = heightIn - qrSize - margin;

  return [createDefaultQrElement(xIn, yIn, qrSize)];
}

// ========================================
// SVG UTILITIES
// ========================================

/**
 * Extract bounding box from <g id="qr-placeholder"> element
 * Used ONLY for initial placement detection
 */
function extractPlaceholderBox(svg: string): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  // Try to match placeholder with transform and data attributes
  const transformMatch = svg.match(
    /<g[^>]*id="qr-placeholder"[^>]*transform="translate\(([^,]+),\s*([^)]+)\)"[^>]*data-width="([^"]+)"[^>]*data-height="([^"]+)"/
  );

  if (transformMatch) {
    return {
      x: parseFloat(transformMatch[1]),
      y: parseFloat(transformMatch[2]),
      width: parseFloat(transformMatch[3]),
      height: parseFloat(transformMatch[4])
    };
  }

  // Also try reverse attribute order
  const reverseMatch = svg.match(
    /<g[^>]*id="qr-placeholder"[^>]*data-width="([^"]+)"[^>]*data-height="([^"]+)"[^>]*transform="translate\(([^,]+),\s*([^)]+)\)"/
  );

  if (reverseMatch) {
    return {
      x: parseFloat(reverseMatch[3]),
      y: parseFloat(reverseMatch[4]),
      width: parseFloat(reverseMatch[1]),
      height: parseFloat(reverseMatch[2])
    };
  }

  // Fallback: placeholder without data attributes (use default 100x100)
  const basicMatch = svg.match(
    /<g[^>]*id="qr-placeholder"[^>]*transform="translate\(([^,]+),\s*([^)]+)\)"/
  );

  if (basicMatch) {
    return {
      x: parseFloat(basicMatch[1]),
      y: parseFloat(basicMatch[2]),
      width: 100,
      height: 100
    };
  }

  // Placeholder exists but no transform
  if (svg.includes('id="qr-placeholder"')) {
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100
    };
  }

  return null;
}

function parseLengthToInches(raw: string): number | null {
  const value = raw.trim();
  const match = value.match(/^([0-9]*\.?[0-9]+)\s*(in|mm|cm|px)?$/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (!isFinite(num)) return null;
  const unit = (match[2] || 'px').toLowerCase();
  switch (unit) {
    case 'in':
      return num;
    case 'mm':
      return num / 25.4;
    case 'cm':
      return num / 2.54;
    case 'px':
      return num / 96;
    default:
      return null;
  }
}

/**
 * SINGLE SOURCE OF TRUTH for SVG physical dimensions
 * All inch conversions must go through this function
 */
function getSvgPhysicalSizeInches(svg: string): { widthIn: number; heightIn: number } {
  const rootMatch = svg.match(/<svg([^>]*)>/i);
  if (!rootMatch) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 'Invalid SVG: No root <svg> tag found');
  }
  
  const attrs = rootMatch[1];
  
  const widthMatch = attrs.match(/\bwidth="([^"]+)"/i);
  const heightMatch = attrs.match(/\bheight="([^"]+)"/i);
  const viewBoxMatch = attrs.match(/\bviewBox="([^"]+)"/i);
  
  let widthIn = widthMatch ? parseLengthToInches(widthMatch[1]) : null;
  let heightIn = heightMatch ? parseLengthToInches(heightMatch[1]) : null;

  // Fallback to viewBox if width/height are missing or invalid
  if ((!widthIn || !heightIn) && viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
    if (parts.length >= 4) {
      // Assuming 96 DPI for unitless viewBox dimensions
      if (!widthIn) widthIn = parts[2] / 96;
      if (!heightIn) heightIn = parts[3] / 96;
    }
  }

  if (!widthIn || !heightIn || widthIn <= 0 || heightIn <= 0) {
    throw new AppError(
      ErrorCodes.INVALID_INPUT,
      'Label physical size could not be determined. Ensure the SVG root has width and height attributes, or a valid viewBox.'
    );
  }

  return { widthIn, heightIn };
}

function extractViewBox(svg: string): string | null {
  const m = svg.match(/\bviewBox="([^"]+)"/i);
  return m ? m[1] : null;
}

function stripOuterSvg(svg: string): string {
  return svg
    .replace(/<\?xml[^?]*\?>/i, '')
    .replace(/<!doctype[^>]*>/i, '')
    .replace(/<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .trim();
}

function prefixSvgIds(svg: string, prefix: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  const p = `${safePrefix}__`;

  let out = svg.replace(/\bid="([^"]+)"/g, (full, id) => {
    if (String(id).startsWith(p)) return full;
    return `id="${p}${id}"`;
  });

  out = out.replace(/url\(#([^)]+)\)/g, (full, id) => {
    if (String(id).startsWith(p)) return full;
    return `url(#${p}${id})`;
  });

  out = out.replace(/\b(xlink:href|href)="#([^"]+)"/g, (full, attr, id) => {
    if (String(id).startsWith(p)) return full;
    return `${attr}="#${p}${id}"`;
  });

  return out;
}

/**
 * Apply label size override at render time (non-destructive)
 */
function applyLabelSizeOverride(
  svg: string,
  nativeWidthIn: number,
  nativeHeightIn: number,
  targetWidthIn: number,
  targetHeightIn: number
): string {
  if (Math.abs(nativeWidthIn - targetWidthIn) < 0.001 && Math.abs(nativeHeightIn - targetHeightIn) < 0.001) {
    return svg;
  }

  const viewBoxMatch = svg.match(/\bviewBox="([^"]+)"/i);
  let viewBox: string;
  
  if (viewBoxMatch) {
    viewBox = viewBoxMatch[1];
  } else {
    const vbWidth = nativeWidthIn * 96;
    const vbHeight = nativeHeightIn * 96;
    viewBox = `0 0 ${vbWidth} ${vbHeight}`;
  }

  let result = svg.replace(/\bwidth="[^"]+"/i, `width="${targetWidthIn}in"`);
  result = result.replace(/\bheight="[^"]+"/i, `height="${targetHeightIn}in"`);
  
  if (!viewBoxMatch) {
    result = result.replace(/<svg([^>]*)>/i, `<svg$1 viewBox="${viewBox}">`);
  }

  return result;
}

// ========================================
// LETTER SHEET COMPOSITION
// ========================================

function computeLetterSheetLayout(labelWidthIn: number, labelHeightIn: number): {
  columns: number;
  rows: number;
  rotationUsed: boolean;
  perSheet: number;
  cellWidthIn: number;
  cellHeightIn: number;
} {
  const cols0 = Math.floor(LETTER_USABLE_WIDTH_IN / labelWidthIn);
  const rows0 = Math.floor(LETTER_USABLE_HEIGHT_IN / labelHeightIn);
  const cap0 = cols0 * rows0;

  const cols90 = Math.floor(LETTER_USABLE_WIDTH_IN / labelHeightIn);
  const rows90 = Math.floor(LETTER_USABLE_HEIGHT_IN / labelWidthIn);
  const cap90 = cols90 * rows90;

  if (cap0 <= 0 && cap90 <= 0) {
    throw new AppError(
      ErrorCodes.INVALID_INPUT,
      'Label does not fit on a letter sheet with 0.25in margins (no scaling allowed).'
    );
  }

  if (cap90 > cap0) {
    return {
      columns: cols90,
      rows: rows90,
      rotationUsed: true,
      perSheet: cap90,
      cellWidthIn: labelHeightIn,
      cellHeightIn: labelWidthIn
    };
  }

  return {
    columns: cols0,
    rows: rows0,
    rotationUsed: false,
    perSheet: cap0,
    cellWidthIn: labelWidthIn,
    cellHeightIn: labelHeightIn
  };
}

export function composeLetterSheetsFromLabelSvgs(params: {
  labelSvgs: string[];
}): { sheets: string[]; meta: LetterSheetLayoutMeta } {
  const { labelSvgs } = params;
  if (!labelSvgs.length) {
    return {
      sheets: [],
      meta: {
        perSheet: 0,
        columns: 0,
        rows: 0,
        rotationUsed: false,
        totalSheets: 0,
        labelWidthIn: 0,
        labelHeightIn: 0
      }
    };
  }

  const first = labelSvgs[0];
  const { widthIn: labelWidthIn, heightIn: labelHeightIn } = getSvgPhysicalSizeInches(first);
  const viewBox = extractViewBox(first);

  const layout = computeLetterSheetLayout(labelWidthIn, labelHeightIn);
  const totalSheets = Math.ceil(labelSvgs.length / layout.perSheet);

  const sheets: string[] = [];
  for (let s = 0; s < totalSheets; s++) {
    const start = s * layout.perSheet;
    const end = Math.min(start + layout.perSheet, labelSvgs.length);
    const chunk = labelSvgs.slice(start, end);

    let content = '';
    for (let i = 0; i < chunk.length; i++) {
      const globalIndex = start + i;
      const r = Math.floor(i / layout.columns);
      const c = i % layout.columns;
      const x = LETTER_MARGIN_IN + c * layout.cellWidthIn;
      const y = LETTER_MARGIN_IN + r * layout.cellHeightIn;

      const prefixed = prefixSvgIds(chunk[i], `lbl_${globalIndex}`);
      const inner = stripOuterSvg(prefixed);
      const vb = extractViewBox(prefixed) || viewBox || undefined;

      if (layout.rotationUsed) {
        content += `
  <g transform="translate(${x}, ${y})">
    <g transform="translate(${layout.cellWidthIn}, 0) rotate(90)">
      <svg x="0" y="0" width="${labelWidthIn}" height="${labelHeightIn}"${vb ? ` viewBox="${vb}"` : ''}>
        ${inner}
      </svg>
    </g>
  </g>`;
      } else {
        content += `
  <g transform="translate(${x}, ${y})">
    <svg x="0" y="0" width="${labelWidthIn}" height="${labelHeightIn}"${vb ? ` viewBox="${vb}"` : ''}>
      ${inner}
    </svg>
  </g>`;
      }
    }

    const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${LETTER_WIDTH_IN}in"
     height="${LETTER_HEIGHT_IN}in"
     viewBox="0 0 ${LETTER_WIDTH_IN} ${LETTER_HEIGHT_IN}">
${content}
</svg>`;
    sheets.push(sheetSvg);
  }

  return {
    sheets,
    meta: {
      perSheet: layout.perSheet,
      columns: layout.columns,
      rows: layout.rows,
      rotationUsed: layout.rotationUsed,
      totalSheets,
      labelWidthIn,
      labelHeightIn
    }
  };
}

// ========================================
// LABEL METADATA & PREVIEW
// ========================================

export interface LabelMetadata {
  widthIn: number;
  heightIn: number;
  elements: PlaceableElement[];
}

export interface LabelPreviewResult {
  svg: string;
  meta: LabelMetadata;
}

/**
 * Get label metadata from a version
 */
export async function getLabelMetadata(versionId: string): Promise<LabelMetadata> {
  const version = await prisma.labelTemplateVersion.findUnique({
    where: { id: versionId }
  });

  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }

  const storage = getLabelStorage();
  const fileBuffer = await storage.load(version.fileUrl);
  const svgContent = fileBuffer.toString('utf-8');

  let widthIn: number;
  let heightIn: number;
  try {
    const size = getSvgPhysicalSizeInches(svgContent);
    widthIn = size.widthIn;
    heightIn = size.heightIn;
  } catch {
    widthIn = 2;
    heightIn = 2;
  }

  const elements = getElementsOrDefault(version.elements as PlaceableElement[] | null, svgContent);

  return {
    widthIn,
    heightIn,
    elements
  };
}

/**
 * Render a label preview with placeholder QR code
 */
export async function renderLabelPreview(
  versionId: string,
  overrides?: { elements?: PlaceableElement[] }
): Promise<string> {
  const result = await renderLabelPreviewWithMeta(versionId, overrides);
  return result.svg;
}

/**
 * Render a label preview with metadata
 */
export async function renderLabelPreviewWithMeta(
  versionId: string,
  overrides?: {
    elements?: PlaceableElement[];
    labelWidthIn?: number;
    labelHeightIn?: number;
  }
): Promise<LabelPreviewResult> {
  const version = await prisma.labelTemplateVersion.findUnique({
    where: { id: versionId },
    include: { template: true }
  });

  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }

  // Load the SVG template
  const storage = getLabelStorage();
  const fileBuffer = await storage.load(version.fileUrl);
  let svgContent = fileBuffer.toString('utf-8');

  // Get native dimensions
  let nativeWidthIn: number;
  let nativeHeightIn: number;
  try {
    const size = getSvgPhysicalSizeInches(svgContent);
    nativeWidthIn = size.widthIn;
    nativeHeightIn = size.heightIn;
  } catch {
    nativeWidthIn = 2;
    nativeHeightIn = 2;
  }

  // Apply label size override
  const finalWidthIn = overrides?.labelWidthIn ?? version.labelWidthIn ?? nativeWidthIn;
  const finalHeightIn = overrides?.labelHeightIn ?? version.labelHeightIn ?? nativeHeightIn;
  
  if (Math.abs(finalWidthIn - nativeWidthIn) > 0.001 || Math.abs(finalHeightIn - nativeHeightIn) > 0.001) {
    svgContent = applyLabelSizeOverride(svgContent, nativeWidthIn, nativeHeightIn, finalWidthIn, finalHeightIn);
  }

  // Get elements: override > stored > default
  const elements = overrides?.elements ?? getElementsOrDefault(version.elements as PlaceableElement[] | null, svgContent);

  // Generate placeholder QR for preview
  const placeholderQrSvg = await generateQrSvgFromUrl('https://psillyops.app/preview');
  
  // Inject elements
  const svg = injectElements(svgContent, elements, placeholderQrSvg);

  return {
    svg,
    meta: {
      widthIn: finalWidthIn,
      heightIn: finalHeightIn,
      elements
    }
  };
}

export interface LetterSheetPreviewResult {
  svg: string;
  meta: LetterSheetLayoutMeta;
  labelMeta: LabelMetadata;
}

/**
 * Render an auto-tiled letter-size sheet preview
 */
export async function renderLetterSheetPreview(params: {
  versionId: string;
  quantity: number;
  elements?: PlaceableElement[];
  labelWidthIn?: number;
  labelHeightIn?: number;
}): Promise<LetterSheetPreviewResult> {
  const { versionId, quantity, elements, labelWidthIn, labelHeightIn } = params;
  const qty = Math.max(1, Math.min(1000, Math.floor(quantity || 1)));

  const labelResult = await renderLabelPreviewWithMeta(versionId, {
    elements,
    labelWidthIn,
    labelHeightIn
  });
  
  const labelSvgs = Array(qty).fill(labelResult.svg).map((s, i) => prefixSvgIds(String(s), `preview_${i}`));

  const { sheets, meta } = composeLetterSheetsFromLabelSvgs({ labelSvgs });
  return {
    svg: sheets[0] || '',
    meta,
    labelMeta: labelResult.meta
  };
}

// ========================================
// SMART PLACEMENT UTILITIES
// ========================================

/**
 * Suggest optimal QR placement (bottom-right with margin)
 */
export function suggestQrPlacement(params: {
  labelWidthIn: number;
  labelHeightIn: number;
  minQrSizeIn?: number;
  marginIn?: number;
}): Placement {
  const { labelWidthIn, labelHeightIn, minQrSizeIn = 0.7, marginIn = 0.1 } = params;
  
  const maxQrSize = Math.min(
    labelWidthIn - marginIn * 2,
    labelHeightIn - marginIn * 2,
    minQrSizeIn
  );
  const qrSize = Math.max(0.5, maxQrSize);

  return {
    xIn: labelWidthIn - qrSize - marginIn,
    yIn: labelHeightIn - qrSize - marginIn,
    widthIn: qrSize,
    heightIn: qrSize,
    rotation: 0
  };
}

/**
 * Calculate maximum safe QR size (centered)
 */
export function calculateMaxQrSize(params: {
  labelWidthIn: number;
  labelHeightIn: number;
  marginIn?: number;
}): Placement {
  const { labelWidthIn, labelHeightIn, marginIn = 0.1 } = params;
  
  const maxSize = Math.min(
    labelWidthIn - marginIn * 2,
    labelHeightIn - marginIn * 2
  );
  const safeSize = Math.max(0.5, maxSize);

  return {
    xIn: (labelWidthIn - safeSize) / 2,
    yIn: (labelHeightIn - safeSize) / 2,
    widthIn: safeSize,
    heightIn: safeSize,
    rotation: 0
  };
}

/**
 * Find candidate regions for QR placement
 */
export function findLargestEmptyRegion(params: {
  labelWidthIn: number;
  labelHeightIn: number;
  qrSizeIn?: number;
  marginIn?: number;
}): Array<{ region: Placement; regionName: string }> {
  const { labelWidthIn, labelHeightIn, qrSizeIn = 0.7, marginIn = 0.1 } = params;
  const size = Math.min(qrSizeIn, labelWidthIn - marginIn * 2, labelHeightIn - marginIn * 2);
  
  return [
    {
      regionName: 'bottom-right',
      region: {
        xIn: labelWidthIn - size - marginIn,
        yIn: labelHeightIn - size - marginIn,
        widthIn: size,
        heightIn: size,
        rotation: 0
      }
    },
    {
      regionName: 'bottom-left',
      region: {
        xIn: marginIn,
        yIn: labelHeightIn - size - marginIn,
        widthIn: size,
        heightIn: size,
        rotation: 0
      }
    },
    {
      regionName: 'top-right',
      region: {
        xIn: labelWidthIn - size - marginIn,
        yIn: marginIn,
        widthIn: size,
        heightIn: size,
        rotation: 0
      }
    },
    {
      regionName: 'top-left',
      region: {
        xIn: marginIn,
        yIn: marginIn,
        widthIn: size,
        heightIn: size,
        rotation: 0
      }
    },
    {
      regionName: 'center',
      region: {
        xIn: (labelWidthIn - size) / 2,
        yIn: (labelHeightIn - size) / 2,
        widthIn: size,
        heightIn: size,
        rotation: 0
      }
    }
  ];
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Build a QR payload for a batch
 */
export function buildBatchQRPayload(batch: { id: string; batchCode: string }, baseUrl: string): QRPayload {
  return {
    type: 'BATCH',
    id: batch.id,
    code: batch.batchCode,
    url: `${baseUrl}/qr/batch/${batch.id}`
  };
}

/**
 * Build a QR payload for a product
 */
export function buildProductQRPayload(product: { id: string; sku: string }, baseUrl: string): QRPayload {
  return {
    type: 'PRODUCT',
    id: product.id,
    code: product.sku,
    url: `${baseUrl}/qr/product/${product.id}`
  };
}

/**
 * Build a QR payload for an inventory item
 */
export function buildInventoryQRPayload(
  inventory: { id: string; lotNumber?: string | null },
  baseUrl: string
): QRPayload {
  return {
    type: 'INVENTORY',
    id: inventory.id,
    code: inventory.lotNumber || inventory.id.slice(-8),
    url: `${baseUrl}/qr/inventory/${inventory.id}`
  };
}

/**
 * Get the base URL for QR codes
 */
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://psillyops.app';
}

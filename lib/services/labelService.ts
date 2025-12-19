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
// Note: fs and path are used for camera registration marks in sheet preview
// These are Node.js APIs available in Vercel serverless functions
import * as fs from 'fs';
import * as path from 'path';
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
  // Optional entity info for barcode rendering
  entityType?: LabelEntityType;
  entityId?: string;
}

// ========================================
// LETTER SHEET CONSTANTS (from centralized source)
// ========================================

import {
  SHEET_WIDTH_IN as LETTER_WIDTH_IN,
  SHEET_HEIGHT_IN as LETTER_HEIGHT_IN,
  SHEET_MARGIN_IN as LETTER_MARGIN_IN,
  SHEET_USABLE_WIDTH_IN as LETTER_USABLE_WIDTH_IN,
  SHEET_USABLE_HEIGHT_IN as LETTER_USABLE_HEIGHT_IN,
  MARGIN_LEFT_IN,
  MARGIN_RIGHT_IN,
  MARGIN_TOP_IN,
  MARGIN_BOTTOM_IN,
  SheetDecorations,
  DEFAULT_SHEET_DECORATIONS,
  REGISTRATION_MARK_LENGTH_IN,
  REGISTRATION_MARK_STROKE_WIDTH_IN,
  REGISTRATION_MARK_COLOR,
  FOOTER_FONT_SIZE_IN,
  FOOTER_COLOR,
  FOOTER_FONT_FAMILY,
} from '@/lib/constants/sheet';

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
 * Note: We exclude the 'elements' field from versions to keep response size small
 */
export async function listTemplates(entityType?: LabelEntityType) {
  const where = entityType ? { entityType } : {};
  
  return prisma.labelTemplate.findMany({
    where,
    include: {
      versions: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          templateId: true,
          version: true,
          fileUrl: true,
          qrTemplate: true,
          labelWidthIn: true,
          labelHeightIn: true,
          isActive: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          // Explicitly exclude 'elements' - it can be huge and cause 413 errors
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Get a single template with all versions
 * Note: We exclude the 'elements' field from versions to keep response size small
 * (elements can be very large JSON and cause 413 errors on Vercel)
 */
export async function getTemplate(templateId: string) {
  const template = await prisma.labelTemplate.findUnique({
    where: { id: templateId },
    include: {
      versions: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          templateId: true,
          version: true,
          fileUrl: true,
          qrTemplate: true,
          labelWidthIn: true,
          labelHeightIn: true,
          isActive: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          // Explicitly exclude 'elements' - it can be huge and cause 413 errors
        }
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
  const { versionId, qrPayload, entityType, entityId } = params;
  
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
  
  // Get barcode value from entity (product.barcodeValue ?? product.sku)
  const barcodeValue = entityType && entityId 
    ? await getEntityBarcodeValue(entityType, entityId)
    : undefined;
  
  // Inject elements at absolute positions (print flow, not editor preview)
  svgContent = injectElements(svgContent, elements, qrSvg, barcodeValue, false);
  
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
  
  // Inject elements (print flow - uses sample barcode since no entity context)
  svgContent = injectElements(svgContent, elements, qrSvg, undefined, true);
  
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
  
  // Render each label with its unique token (uses sample barcode since no entity context)
  const svgs: string[] = [];
  for (const token of tokens) {
    const tokenUrl = `${baseUrl}/qr/${token}`;
    const qrSvg = await generateQrSvgFromUrl(tokenUrl);
    const svgContent = injectElements(svgTemplate, elements, qrSvg, undefined, true);
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

  // Get entity code and barcode value
  let entityCode: string;
  let barcodeValue: string | undefined;
  try {
    entityCode = await getEntityCode(entityType, entityId);
  } catch (err) {
    throw err;
  }
  try {
    barcodeValue = await getEntityBarcodeValue(entityType, entityId);
  } catch (err) {
    throw err;
  }

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
  
  // Check if label has BARCODE elements - if so, barcode value is required (print flow enforcement)
  const hasBarcodeElement = elements.some(el => el.type === 'BARCODE');
  if (hasBarcodeElement && !barcodeValue) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 'Barcode required but missing for this product. Set a barcode value in Product Settings.');
  }

  if (mode === 'embedded') {
    if (!qrPayload) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'qrPayload required for embedded mode');
    }

    const qrSvg = await generateQrSvgFromUrl(qrPayload.url);
    // Print flow - not editor preview
    const svg = injectElements(svgTemplate, elements, qrSvg, barcodeValue, false);

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
      // Print flow - not editor preview
      const svgContent = injectElements(svgTemplate, elements, qrSvg, barcodeValue, false);
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

/**
 * Get the barcode value for an entity
 * 
 * Source of truth: Product owns barcode data
 * - barcodeValue defaults to SKU if not explicitly set
 * - No placeholder barcodes ever render
 */
async function getEntityBarcodeValue(entityType: LabelEntityType, entityId: string): Promise<string | undefined> {
  switch (entityType) {
    case 'PRODUCT': {
      const product = await prisma.product.findUnique({ 
        where: { id: entityId },
        select: { barcodeValue: true, sku: true }
      });
      if (!product) return undefined;
      // barcodeValue defaults to SKU
      return product.barcodeValue ?? product.sku;
    }
    case 'BATCH': {
      // Batches inherit barcode from their product
      const batch = await prisma.batch.findUnique({ 
        where: { id: entityId },
        include: { product: { select: { barcodeValue: true, sku: true } } }
      });
      if (!batch?.product) return undefined;
      return batch.product.barcodeValue ?? batch.product.sku;
    }
    case 'INVENTORY': {
      // Inventory items may be linked to products
      const inventory = await prisma.inventoryItem.findUnique({ 
        where: { id: entityId },
        include: { product: { select: { barcodeValue: true, sku: true } } }
      });
      if (!inventory?.product) return undefined;
      return inventory.product.barcodeValue ?? inventory.product.sku;
    }
    default:
      return undefined;
  }
}

// ========================================
// ELEMENT INJECTION (UNIFIED PLACEMENT)
// ========================================

// Sample barcode for editor preview (no product context)
const EDITOR_PREVIEW_BARCODE = 'SKU-EXAMPLE';

/**
 * Inject placeable elements into SVG at absolute inch positions.
 * 
 * CRITICAL: All inch-to-SVG conversions go through getSvgPhysicalSizeInches
 * and extractViewBox. No hardcoded DPI assumptions.
 * 
 * Rotation uses translate-rotate-translate pattern for cross-renderer consistency.
 * 
 * @param svg - The base SVG template
 * @param elements - Placeable elements to inject
 * @param qrSvgContent - Generated QR code SVG content
 * @param barcodeValue - Product barcode value for print flows, undefined for editor preview
 * @param isEditorPreview - If true, use sample barcode; if false, require real barcode for BARCODE elements
 */
function injectElements(
  svg: string,
  elements: PlaceableElement[],
  qrSvgContent: string,
  barcodeValue?: string,
  isEditorPreview: boolean = false
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
      let qrInner = stripOuterSvg(qrSvgContent);
      
      // Handle transparent background: remove white background from QR
      const showBackground = el.background !== 'transparent';
      if (!showBackground) {
        // Remove the white background rect from QR SVG (first path with fill="#FFFFFF")
        qrInner = qrInner.replace(/<path[^>]*fill="#FFFFFF"[^>]*\/?>/i, '');
        qrInner = qrInner.replace(/<rect[^>]*fill="#FFFFFF"[^>]*\/?>/i, '');
        qrInner = qrInner.replace(/<rect[^>]*fill="white"[^>]*\/?>/i, '');
      }

      injectedContent += `
  <g ${rotateAttr}>
    <svg x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}"${qrVbSize ? ` viewBox="0 0 ${qrVbSize} ${qrVbSize}"` : ''} shape-rendering="crispEdges">
      ${qrInner}
    </svg>
  </g>`;
    } else if (el.type === 'BARCODE' && el.barcode) {
      // BARCODE injection logic:
      // - Editor preview: always use sample barcode (EDITOR_PREVIEW_BARCODE)
      // - Print flows: use product.barcodeValue ?? product.sku (required)
      const barHeightVb = el.barcode.barHeightIn * pxPerInchX;
      const textSizeVb = el.barcode.textSizeIn * pxPerInchX;
      const textGapVb = el.barcode.textGapIn * pxPerInchX;
      const textY = barHeightVb + textGapVb + textSizeVb * 0.85;
      
      // Handle transparent background
      const showBackground = el.background !== 'transparent';
      
      // Determine barcode value based on context
      const actualCode = isEditorPreview ? EDITOR_PREVIEW_BARCODE : (barcodeValue || '');
      
      // EAN-13 structure: 95 modules total
      const totalModules = 95;
      const moduleWidth = w * 0.85 / totalModules;
      const barsStartX = w * 0.1; // 10% left margin for first digit
      
      // Simplified EAN-13 pattern for visual representation
      const pattern = '101' + // Start guard
        '0001101001100101001101110100011011000' + // Left 6 digits (simplified)
        '1' + // Part of left
        '01010' + // Center guard
        '1110010110011011011001000010101110010011' + // Right 6 digits (simplified)
        '10' + // Part of right
        '101'; // End guard
      
      let barsContent = '';
      let barX = barsStartX;
      for (let i = 0; i < Math.min(pattern.length, totalModules); i++) {
        if (pattern[i] === '1') {
          // Guard bars extend below text line
          const isGuard = i < 3 || i >= 92 || (i >= 45 && i < 50);
          const barHeight = isGuard ? barHeightVb + textGapVb : barHeightVb;
          barsContent += `<rect x="${barX.toFixed(3)}" y="0" width="${moduleWidth.toFixed(3)}" height="${barHeight.toFixed(3)}" fill="#000"/>`;
        }
        barX += moduleWidth;
      }
      
      // Display the barcode value
      // For EAN-13 format: X XXXXXX XXXXXX (first digit outside, then 6+6)
      // For other formats: display as-is, centered
      const isEan13 = actualCode.length === 13 && /^\d+$/.test(actualCode);
      
      const firstDigitX = barsStartX - textSizeVb * 0.6;
      const leftGroupX = barsStartX + (3 + 21) * moduleWidth;
      const rightGroupX = barsStartX + (3 + 42 + 5 + 21) * moduleWidth;
      const letterSpacing = moduleWidth * 1.2;
      
      // Background rect only if not transparent
      const bgRect = showBackground 
        ? `<rect x="0" y="0" width="${w.toFixed(3)}" height="${h.toFixed(3)}" fill="${el.barcode.backgroundColor}"/>`
        : '';
      
      let textContent: string;
      if (isEan13) {
        // EAN-13 format display
        const firstDigit = actualCode[0];
        const leftGroup = actualCode.slice(1, 7);
        const rightGroup = actualCode.slice(7, 13);
        textContent = `
      <text x="${firstDigitX.toFixed(3)}" y="${textY.toFixed(3)}" text-anchor="middle" font-family="'OCR-B', 'Courier New', monospace" font-size="${textSizeVb.toFixed(3)}" fill="#000">${firstDigit}</text>
      <text x="${leftGroupX.toFixed(3)}" y="${textY.toFixed(3)}" text-anchor="middle" font-family="'OCR-B', 'Courier New', monospace" font-size="${textSizeVb.toFixed(3)}" letter-spacing="${letterSpacing.toFixed(3)}" fill="#000">${leftGroup}</text>
      <text x="${rightGroupX.toFixed(3)}" y="${textY.toFixed(3)}" text-anchor="middle" font-family="'OCR-B', 'Courier New', monospace" font-size="${textSizeVb.toFixed(3)}" letter-spacing="${letterSpacing.toFixed(3)}" fill="#000">${rightGroup}</text>`;
      } else {
        // Non-EAN format - display centered
        textContent = `<text x="${(w / 2).toFixed(3)}" y="${textY.toFixed(3)}" text-anchor="middle" font-family="'OCR-B', 'Courier New', monospace" font-size="${textSizeVb.toFixed(3)}" fill="#000">${actualCode}</text>`;
      }
      
      injectedContent += `
  <g ${rotateAttr}>
    <svg x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}" viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}">
      ${bgRect}
      ${barsContent}
      ${textContent}
    </svg>
  </g>`;
    }
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

export function computeLetterSheetLayout(
  labelWidthIn: number, 
  labelHeightIn: number,
  orientation: 'portrait' | 'landscape' = 'portrait',
  marginIn: number = LETTER_MARGIN_IN
): {
  columns: number;
  rows: number;
  rotationUsed: boolean;
  perSheet: number;
  cellWidthIn: number;
  cellHeightIn: number;
  sheetWidthIn: number;
  sheetHeightIn: number;
  marginIn: number;
  // Asymmetric margins for registration marks
  marginLeftIn: number;
  marginRightIn: number;
  marginTopIn: number;
  marginBottomIn: number;
} {
  // Sheet dimensions based on orientation
  const sheetWidthIn = orientation === 'portrait' ? LETTER_WIDTH_IN : LETTER_HEIGHT_IN;
  const sheetHeightIn = orientation === 'portrait' ? LETTER_HEIGHT_IN : LETTER_WIDTH_IN;
  
  // Use the marginIn parameter from UI for left/right margins
  // Top/bottom are fixed at 0.5in minimum for registration marks
  const marginLeftIn = marginIn;
  const marginRightIn = marginIn;
  const marginTopIn = Math.max(marginIn, MARGIN_TOP_IN);  // At least 0.5in for marks
  const marginBottomIn = Math.max(marginIn, MARGIN_BOTTOM_IN);  // At least 0.5in for marks
  
  // Usable area after margins
  const usableWidthIn = sheetWidthIn - marginLeftIn - marginRightIn;
  const usableHeightIn = sheetHeightIn - marginTopIn - marginBottomIn;

  const cols0 = Math.floor(usableWidthIn / labelWidthIn);
  const rows0 = Math.floor(usableHeightIn / labelHeightIn);
  const cap0 = cols0 * rows0;

  const cols90 = Math.floor(usableWidthIn / labelHeightIn);
  const rows90 = Math.floor(usableHeightIn / labelWidthIn);
  const cap90 = cols90 * rows90;

  if (cap0 <= 0 && cap90 <= 0) {
    // Return empty layout instead of throwing - let UI handle the warning
    return {
      columns: 0,
      rows: 0,
      rotationUsed: false,
      perSheet: 0,
      cellWidthIn: labelWidthIn,
      cellHeightIn: labelHeightIn,
      sheetWidthIn,
      sheetHeightIn,
      marginIn,
      marginLeftIn,
      marginRightIn,
      marginTopIn,
      marginBottomIn,
    };
  }

  if (cap90 > cap0) {
    return {
      columns: cols90,
      rows: rows90,
      rotationUsed: true,
      perSheet: cap90,
      cellWidthIn: labelHeightIn,
      cellHeightIn: labelWidthIn,
      sheetWidthIn,
      sheetHeightIn,
      marginIn,
      marginLeftIn,
      marginRightIn,
      marginTopIn,
      marginBottomIn,
    };
  }

  return {
    columns: cols0,
    rows: rows0,
    rotationUsed: false,
    perSheet: cap0,
    cellWidthIn: labelWidthIn,
    cellHeightIn: labelHeightIn,
    sheetWidthIn,
    sheetHeightIn,
    marginIn,
    marginLeftIn,
    marginRightIn,
    marginTopIn,
    marginBottomIn,
  };
}

export function composeLetterSheetsFromLabelSvgs(params: {
  labelSvgs: string[];
  orientation?: 'portrait' | 'landscape';
  marginIn?: number;
  decorations?: SheetDecorations;
}): { sheets: string[]; meta: LetterSheetLayoutMeta } {
  const { 
    labelSvgs, 
    orientation = 'portrait', 
    marginIn = LETTER_MARGIN_IN,
    decorations = DEFAULT_SHEET_DECORATIONS,
  } = params;
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

  const layout = computeLetterSheetLayout(labelWidthIn, labelHeightIn, orientation, marginIn);
  
  // Handle case where labels don't fit
  if (layout.perSheet === 0) {
    return {
      sheets: [],
      meta: {
        perSheet: 0,
        columns: 0,
        rows: 0,
        rotationUsed: false,
        totalSheets: 0,
        labelWidthIn,
        labelHeightIn
      }
    };
  }
  
  const totalSheets = Math.ceil(labelSvgs.length / layout.perSheet);

  // PERFORMANCE OPTIMIZATION: Use SVG <defs>/<use> with <g> instancing
  // CRITICAL: Use <g> NOT <svg> inside <defs> to avoid per-instance re-layout
  // Define the label once as a <g>, reference it N times with <use>
  
  // Extract the first label as the template (all labels on a sheet are identical)
  const templateSvg = labelSvgs[0];
  const prefixedTemplate = prefixSvgIds(templateSvg, 'label_template');
  const templateInner = stripOuterSvg(prefixedTemplate);
  const templateVb = extractViewBox(prefixedTemplate) || viewBox;
  
  // Parse template viewBox to compute scaling factor
  // The sheet uses inches as viewBox units, but the label uses its own viewBox units
  // We need to scale the label content to fit in labelWidthIn x labelHeightIn inches
  let scaleX = 1;
  let scaleY = 1;
  if (templateVb) {
    const vbParts = templateVb.split(/\s+/).map(parseFloat);
    if (vbParts.length >= 4) {
      const [, , vbW, vbH] = vbParts;
      // Scale from label viewBox units to inches (sheet viewBox uses inches)
      scaleX = labelWidthIn / vbW;
      scaleY = labelHeightIn / vbH;
    }
  }

  const sheets: string[] = [];
  for (let s = 0; s < totalSheets; s++) {
    const start = s * layout.perSheet;
    const end = Math.min(start + layout.perSheet, labelSvgs.length);
    const labelsOnThisSheet = end - start;

    // Build <use> references for each label position
    // Use transform="translate(x, y)" instead of x/y attributes to avoid bbox recalculation
    // Use asymmetric margins: marginLeftIn for x, marginTopIn for y
    let useRefs = '';
    for (let i = 0; i < labelsOnThisSheet; i++) {
      const r = Math.floor(i / layout.columns);
      const c = i % layout.columns;
      const x = layout.marginLeftIn + c * layout.cellWidthIn;
      const y = layout.marginTopIn + r * layout.cellHeightIn;

      if (layout.rotationUsed) {
        // For rotated labels: translate to position, then rotate 90° around origin
        // The label is rotated so its width becomes height and vice versa
        useRefs += `
    <use href="#label-instance" transform="translate(${x + labelHeightIn}, ${y}) rotate(90)"/>`;
      } else {
        useRefs += `
    <use href="#label-instance" transform="translate(${x}, ${y})"/>`;
      }
    }

    // Render decorations for this sheet
    const decorationsContent = renderSheetDecorations(
      decorations,
      layout.sheetWidthIn,
      layout.sheetHeightIn,
      layout.marginTopIn, // Use top margin for footer positioning
      s,
      totalSheets
    );

    // Render camera registration marks (3 marks for LightBurn alignment)
    // Pass asymmetric margins for proper positioning
    const cameraMarksContent = renderCameraRegistrationMarks(
      layout.sheetWidthIn,
      layout.sheetHeightIn,
      layout.marginLeftIn,
      layout.marginRightIn,
      layout.marginTopIn,
      layout.marginBottomIn
    );

    // Build the sheet SVG with <defs> containing the label as a <g> (NOT <svg>)
    // The <g> is pre-scaled so each <use> just needs translation
    const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${layout.sheetWidthIn}in"
     height="${layout.sheetHeightIn}in"
     viewBox="0 0 ${layout.sheetWidthIn} ${layout.sheetHeightIn}">
  <defs>
    <g id="label-instance" transform="scale(${scaleX}, ${scaleY})">
      ${templateInner}
    </g>
  </defs>
  <g id="sheet-layout">${useRefs}
  </g>${decorationsContent}${cameraMarksContent}
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
  /**
   * Pixels per inch derived from SVG viewBox and physical dimensions.
   * Use this for accurate design-space <-> print-space conversion.
   * If viewBox is non-uniform, pxPerInchY may differ from pxPerInchX.
   */
  pxPerInchX: number;
  pxPerInchY: number;
}

export interface LabelPreviewResult {
  svg: string;
  meta: LabelMetadata;
}

/**
 * Compute pxPerInch from SVG viewBox and physical dimensions.
 * This is the SINGLE SOURCE OF TRUTH for design-space <-> print-space conversion.
 */
function computePxPerInch(svgContent: string, widthIn: number, heightIn: number): { pxPerInchX: number; pxPerInchY: number } {
  const viewBox = extractViewBox(svgContent);
  
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

  return {
    pxPerInchX: vbWidth / widthIn,
    pxPerInchY: vbHeight / heightIn
  };
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
  const { pxPerInchX, pxPerInchY } = computePxPerInch(svgContent, widthIn, heightIn);

  return {
    widthIn,
    heightIn,
    elements,
    pxPerInchX,
    pxPerInchY
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
 * 
 * @param versionId - Label template version ID
 * @param overrides - Optional overrides for elements and size
 * @param entityInfo - Optional entity info for barcode rendering (if provided, real barcode is used)
 */
export async function renderLabelPreviewWithMeta(
  versionId: string,
  overrides?: {
    elements?: PlaceableElement[];
    labelWidthIn?: number;
    labelHeightIn?: number;
  },
  entityInfo?: {
    entityType: LabelEntityType;
    entityId: string;
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
  
  // Calculate scale factors for element positioning
  // Elements are stored in inches relative to the STORED label size (or native if not stored)
  const storedWidthIn = version.labelWidthIn ?? nativeWidthIn;
  const storedHeightIn = version.labelHeightIn ?? nativeHeightIn;
  const scaleX = finalWidthIn / storedWidthIn;
  const scaleY = finalHeightIn / storedHeightIn;
  const needsElementScaling = Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001;
  
  
  if (Math.abs(finalWidthIn - nativeWidthIn) > 0.001 || Math.abs(finalHeightIn - nativeHeightIn) > 0.001) {
    svgContent = applyLabelSizeOverride(svgContent, nativeWidthIn, nativeHeightIn, finalWidthIn, finalHeightIn);
  }

  // Get elements: override > stored > default
  let elements = overrides?.elements ?? getElementsOrDefault(version.elements as PlaceableElement[] | null, svgContent);
  
  // Scale element positions if label size changed
  // This ensures QR/barcode stay in their relative positions when label is resized
  // Elements are ALWAYS in stored/native coordinates, so we must scale them when the label is resized
  if (needsElementScaling) {
    elements = elements.map(el => ({
      ...el,
      placement: {
        ...el.placement,
        xIn: el.placement.xIn * scaleX,
        yIn: el.placement.yIn * scaleY,
        widthIn: el.placement.widthIn * scaleX,
        heightIn: el.placement.heightIn * scaleY,
      },
      // Scale barcode-specific dimensions if present
      barcode: el.barcode ? {
        ...el.barcode,
        barHeightIn: el.barcode.barHeightIn * scaleY,
        textSizeIn: el.barcode.textSizeIn * scaleX,
        textGapIn: el.barcode.textGapIn * scaleY,
      } : undefined,
    }));
  }

  // Compute pxPerInch from the final SVG (after any size override)
  const { pxPerInchX, pxPerInchY } = computePxPerInch(svgContent, finalWidthIn, finalHeightIn);

  // Generate placeholder QR for preview
  const placeholderQrSvg = await generateQrSvgFromUrl('https://psillyops.app/preview');
  
  // Determine if this is editor preview (no entity context) or print preview (with entity)
  const isEditorPreview = !entityInfo;
  
  // Get barcode value if entity info provided (for print preview with product data)
  const barcodeValue = entityInfo 
    ? await getEntityBarcodeValue(entityInfo.entityType, entityInfo.entityId)
    : undefined;
  
  // Inject elements - editor preview uses sample barcode, print preview uses real barcode
  const svg = injectElements(svgContent, elements, placeholderQrSvg, barcodeValue, isEditorPreview);

  return {
    svg,
    meta: {
      widthIn: finalWidthIn,
      heightIn: finalHeightIn,
      elements,
      pxPerInchX,
      pxPerInchY
    }
  };
}

export interface LetterSheetPreviewResult {
  svg: string;
  meta: LetterSheetLayoutMeta;
  labelMeta: LabelMetadata;
}

/**
 * Render sheet decorations (footer, registration marks, center crosshair)
 * These are optional print helpers that appear outside the label grid.
 */
function renderSheetDecorations(
  decorations: SheetDecorations,
  sheetWidthIn: number,
  sheetHeightIn: number,
  marginIn: number,
  sheetIndex: number,
  totalSheets: number
): string {
  if (!decorations.showFooter && !decorations.showRegistrationMarks && !decorations.showCenterCrosshair) {
    return '';
  }

  let content = '\n  <g id="sheet-decorations">';

  // Registration marks at corners
  if (decorations.showRegistrationMarks) {
    const len = REGISTRATION_MARK_LENGTH_IN;
    const sw = REGISTRATION_MARK_STROKE_WIDTH_IN;
    const color = REGISTRATION_MARK_COLOR;

    // Top-left corner
    content += `
    <line x1="${marginIn - len}" y1="${marginIn}" x2="${marginIn}" y2="${marginIn}" stroke="${color}" stroke-width="${sw}"/>
    <line x1="${marginIn}" y1="${marginIn - len}" x2="${marginIn}" y2="${marginIn}" stroke="${color}" stroke-width="${sw}"/>`;

    // Top-right corner
    content += `
    <line x1="${sheetWidthIn - marginIn}" y1="${marginIn}" x2="${sheetWidthIn - marginIn + len}" y2="${marginIn}" stroke="${color}" stroke-width="${sw}"/>
    <line x1="${sheetWidthIn - marginIn}" y1="${marginIn - len}" x2="${sheetWidthIn - marginIn}" y2="${marginIn}" stroke="${color}" stroke-width="${sw}"/>`;

    // Bottom-left corner
    content += `
    <line x1="${marginIn - len}" y1="${sheetHeightIn - marginIn}" x2="${marginIn}" y2="${sheetHeightIn - marginIn}" stroke="${color}" stroke-width="${sw}"/>
    <line x1="${marginIn}" y1="${sheetHeightIn - marginIn}" x2="${marginIn}" y2="${sheetHeightIn - marginIn + len}" stroke="${color}" stroke-width="${sw}"/>`;

    // Bottom-right corner
    content += `
    <line x1="${sheetWidthIn - marginIn}" y1="${sheetHeightIn - marginIn}" x2="${sheetWidthIn - marginIn + len}" y2="${sheetHeightIn - marginIn}" stroke="${color}" stroke-width="${sw}"/>
    <line x1="${sheetWidthIn - marginIn}" y1="${sheetHeightIn - marginIn}" x2="${sheetWidthIn - marginIn}" y2="${sheetHeightIn - marginIn + len}" stroke="${color}" stroke-width="${sw}"/>`;
  }

  // Center crosshair
  if (decorations.showCenterCrosshair) {
    const cx = sheetWidthIn / 2;
    const cy = sheetHeightIn / 2;
    const len = REGISTRATION_MARK_LENGTH_IN * 0.5; // Smaller than corner marks
    const sw = REGISTRATION_MARK_STROKE_WIDTH_IN;
    const color = REGISTRATION_MARK_COLOR;

    content += `
    <line x1="${cx - len}" y1="${cy}" x2="${cx + len}" y2="${cy}" stroke="${color}" stroke-width="${sw}"/>
    <line x1="${cx}" y1="${cy - len}" x2="${cx}" y2="${cy + len}" stroke="${color}" stroke-width="${sw}"/>`;
  }

  // Footer text
  if (decorations.showFooter) {
    const footerY = sheetHeightIn - marginIn + FOOTER_FONT_SIZE_IN + 0.05; // Just below margin
    const footerX = marginIn;
    
    // Build footer text: Product · Version · Printed DATE · Sheet X/Y · Notes
    const parts: string[] = [];
    
    if (decorations.productName) {
      parts.push(decorations.productName);
    }
    if (decorations.versionLabel) {
      parts.push(decorations.versionLabel);
    }
    
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    parts.push(`Printed ${date}`);
    
    if (totalSheets > 1) {
      parts.push(`Sheet ${sheetIndex + 1}/${totalSheets}`);
    }
    
    if (decorations.footerNotes) {
      parts.push(decorations.footerNotes);
    }
    
    const footerContent = parts.join(' · ');

    content += `
    <text 
      x="${footerX}" 
      y="${footerY}"
      font-size="${FOOTER_FONT_SIZE_IN}"
      font-family="${FOOTER_FONT_FAMILY}"
      fill="${FOOTER_COLOR}"
      text-anchor="start"
    >${footerContent}</text>`;
  }

  content += '\n  </g>';
  return content;
}

// ========================================
// CAMERA REGISTRATION MARKS
// ========================================

// Camera registration mark constants
const CAMERA_MARK_SIZE_IN = 0.4;  // Fixed physical size for each mark
const CAMERA_MARK_OFFSET_IN = 0.2; // Offset from grid edge

// Cache for the base64-encoded camera mark image
let cameraMarkDataUri: string | null = null;

/**
 * Get the camera mark image as a data URI (cached)
 */
function getCameraMarkDataUri(): string {
  if (cameraMarkDataUri) {
    return cameraMarkDataUri;
  }
  
  try {
    // Read the image file from the public directory
    const imagePath = path.join(process.cwd(), 'public', 'img_0221.png');
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString('base64');
    cameraMarkDataUri = `data:image/png;base64,${base64}`;
    return cameraMarkDataUri;
  } catch (error) {
    console.error('Failed to load camera mark image:', error);
    // Return empty string if image can't be loaded
    return '';
  }
}

/**
 * Render camera registration marks for LightBurn/overhead camera alignment.
 * Places exactly 3 marks: top-center, bottom-left, bottom-right.
 * Marks are centered within the margin bands to prevent clipping.
 * 
 * Margin layout (asymmetric):
 * - Top margin: 0.5in (larger for registration marks)
 * - Bottom margin: 0.5in (larger for registration marks)
 * - Left margin: 0.25in (narrow for max width)
 * - Right margin: 0.25in (narrow for max width)
 */
function renderCameraRegistrationMarks(
  sheetWidthIn: number,
  sheetHeightIn: number,
  marginLeftIn: number,
  marginRightIn: number,
  marginTopIn: number,
  marginBottomIn: number
): string {
  const imageDataUri = getCameraMarkDataUri();
  if (!imageDataUri) {
    return ''; // Skip marks if image couldn't be loaded
  }
  
  // Mark size - use standard size
  const size = CAMERA_MARK_SIZE_IN;
  
  // Padding from page edges - increased to prevent clipping
  const padding = 0.15; // 0.15in from page edge (was 0.05in, too close)
  
  // Calculate positions
  // Top-center: centered horizontally, in the top margin (centered vertically)
  const topCenterX = (sheetWidthIn - size) / 2;
  const topCenterY = (marginTopIn - size) / 2; // Centered in top margin band
  
  // Bottom-left: near bottom-left corner with padding
  const bottomLeftX = padding;
  const bottomLeftY = sheetHeightIn - marginBottomIn + (marginBottomIn - size) / 2;
  
  // Bottom-right: near bottom-right corner with padding
  const bottomRightX = sheetWidthIn - size - padding;
  const bottomRightY = sheetHeightIn - marginBottomIn + (marginBottomIn - size) / 2;
  
  // Use xlink:href for better compatibility with resvg and older SVG renderers
  return `
  <g id="camera-registration-marks">
    <!-- Top-center mark (centered in top margin) -->
    <image
      xlink:href="${imageDataUri}"
      x="${topCenterX}"
      y="${topCenterY}"
      width="${size}"
      height="${size}"
    />
    <!-- Bottom-left mark (centered in bottom-left margin corner) -->
    <image
      xlink:href="${imageDataUri}"
      x="${bottomLeftX}"
      y="${bottomLeftY}"
      width="${size}"
      height="${size}"
    />
    <!-- Bottom-right mark (centered in bottom-right margin corner) -->
    <image
      xlink:href="${imageDataUri}"
      x="${bottomRightX}"
      y="${bottomRightY}"
      width="${size}"
      height="${size}"
    />
  </g>`;
}

/**
 * Compose a sheet preview with ONE real label and placeholder boxes for remaining positions.
 * This is a PREVIEW-ONLY optimization - print/PDF must still use full rendering.
 * 
 * Benefits:
 * - Instant preview even with 50+ labels
 * - No SVG duplication or instancing complexity
 * - Visually clear: users see one real label + placement indicators
 */
export function composeLetterSheetPreview(params: {
  labelSvg: string;
  totalLabels: number;
  orientation?: 'portrait' | 'landscape';
  marginIn?: number;
  labelWidthIn?: number;
  labelHeightIn?: number;
  decorations?: SheetDecorations;
  sheetIndex?: number;
  totalSheets?: number;
}): { svg: string; meta: LetterSheetLayoutMeta } {
  const { 
    labelSvg, 
    totalLabels, 
    orientation = 'portrait', 
    marginIn = LETTER_MARGIN_IN,
    decorations = DEFAULT_SHEET_DECORATIONS,
    sheetIndex = 0,
  } = params;
  
  if (!labelSvg || totalLabels < 1) {
    return {
      svg: '',
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

  // Use provided label dimensions if available, otherwise extract from SVG
  const svgDimensions = getSvgPhysicalSizeInches(labelSvg);
  const labelWidthIn = params.labelWidthIn ?? svgDimensions.widthIn;
  const labelHeightIn = params.labelHeightIn ?? svgDimensions.heightIn;
  
  const viewBox = extractViewBox(labelSvg);
  const layout = computeLetterSheetLayout(labelWidthIn, labelHeightIn, orientation, marginIn);

  if (layout.perSheet === 0) {
    return {
      svg: '',
      meta: {
        perSheet: 0,
        columns: 0,
        rows: 0,
        rotationUsed: false,
        totalSheets: 0,
        labelWidthIn,
        labelHeightIn
      }
    };
  }

  const totalSheets = Math.ceil(totalLabels / layout.perSheet);
  // Always show full grid in preview (all positions on the sheet)
  // This gives users a clear picture of the sheet layout
  const labelsOnFirstSheet = layout.perSheet;
  
  // Prepare the ONE real label for position 0
  const prefixedLabel = prefixSvgIds(labelSvg, 'label_real');
  const labelInner = stripOuterSvg(prefixedLabel);
  const labelVb = extractViewBox(prefixedLabel) || viewBox;
  
  // Compute scaling factor from label viewBox to sheet inches
  let scaleX = 1;
  let scaleY = 1;
  if (labelVb) {
    const vbParts = labelVb.split(/\s+/).map(parseFloat);
    if (vbParts.length >= 4) {
      const [, , vbW, vbH] = vbParts;
      scaleX = labelWidthIn / vbW;
      scaleY = labelHeightIn / vbH;
    }
  }

  // Build content: one real label + placeholder boxes
  // Use asymmetric margins: marginLeftIn for x, marginTopIn for y
  let content = '';
  
  for (let i = 0; i < labelsOnFirstSheet; i++) {
    const r = Math.floor(i / layout.columns);
    const c = i % layout.columns;
    const x = layout.marginLeftIn + c * layout.cellWidthIn;
    const y = layout.marginTopIn + r * layout.cellHeightIn;
    
    // Determine label dimensions in cell (accounting for rotation)
    const cellLabelW = layout.rotationUsed ? labelHeightIn : labelWidthIn;
    const cellLabelH = layout.rotationUsed ? labelWidthIn : labelHeightIn;

    if (i === 0) {
      // FIRST POSITION: Render the full label SVG
      if (layout.rotationUsed) {
        content += `
    <g transform="translate(${x + labelHeightIn}, ${y}) rotate(90)">
      <g transform="scale(${scaleX}, ${scaleY})">
        ${labelInner}
      </g>
    </g>`;
      } else {
        content += `
    <g transform="translate(${x}, ${y})">
      <g transform="scale(${scaleX}, ${scaleY})">
        ${labelInner}
      </g>
    </g>`;
      }
    } else {
      // REMAINING POSITIONS: Render placeholder rectangles
      // Placeholder: stroke-only, dashed outline, no fill
      if (layout.rotationUsed) {
        content += `
    <rect 
      x="${x}" 
      y="${y}" 
      width="${cellLabelW}" 
      height="${cellLabelH}"
      fill="none"
      stroke="rgba(0,0,0,0.35)"
      stroke-width="0.01"
      stroke-dasharray="0.04 0.04"
    />`;
      } else {
        content += `
    <rect 
      x="${x}" 
      y="${y}" 
      width="${labelWidthIn}" 
      height="${labelHeightIn}"
      fill="none"
      stroke="rgba(0,0,0,0.35)"
      stroke-width="0.01"
      stroke-dasharray="0.04 0.04"
    />`;
      }
    }
  }

  // Optional: Add label count indicator
  const countText = totalLabels > 1 
    ? `
    <text 
      x="${layout.sheetWidthIn - layout.marginRightIn}" 
      y="${layout.sheetHeightIn - 0.1}"
      font-size="0.12"
      font-family="system-ui, sans-serif"
      fill="rgba(0,0,0,0.4)"
      text-anchor="end"
    >×${totalLabels} labels${totalSheets > 1 ? ` (${totalSheets} sheets)` : ''}</text>`
    : '';

  // Render decorations (footer, registration marks, crosshair)
  const decorationsContent = renderSheetDecorations(
    decorations,
    layout.sheetWidthIn,
    layout.sheetHeightIn,
    layout.marginTopIn, // Use top margin for footer positioning
    sheetIndex,
    totalSheets
  );

  // Render camera registration marks (3 marks for LightBurn alignment)
  // Pass asymmetric margins for proper positioning
  const cameraMarksContent = renderCameraRegistrationMarks(
    layout.sheetWidthIn,
    layout.sheetHeightIn,
    layout.marginLeftIn,
    layout.marginRightIn,
    layout.marginTopIn,
    layout.marginBottomIn
  );

  const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${layout.sheetWidthIn}in"
     height="${layout.sheetHeightIn}in"
     viewBox="0 0 ${layout.sheetWidthIn} ${layout.sheetHeightIn}">
  <g id="sheet-layout">${content}
  </g>${countText}${decorationsContent}${cameraMarksContent}
</svg>`;

  return {
    svg: sheetSvg,
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

/**
 * Render an auto-tiled letter-size sheet preview
 * Uses optimized preview rendering: ONE real label + placeholder boxes
 * 
 * @param params.entityType - Optional entity type for barcode rendering
 * @param params.entityId - Optional entity ID for barcode rendering
 */
export async function renderLetterSheetPreview(params: {
  versionId: string;
  quantity: number;
  elements?: PlaceableElement[];
  labelWidthIn?: number;
  labelHeightIn?: number;
  orientation?: 'portrait' | 'landscape';
  marginIn?: number;
  decorations?: SheetDecorations;
  // Optional entity info for barcode rendering
  entityType?: LabelEntityType;
  entityId?: string;
}): Promise<LetterSheetPreviewResult> {
  const { 
    versionId, 
    quantity, 
    elements, 
    labelWidthIn, 
    labelHeightIn, 
    orientation = 'portrait', 
    marginIn,
    decorations = DEFAULT_SHEET_DECORATIONS,
    entityType,
    entityId,
  } = params;
  const qty = Math.max(1, Math.min(1000, Math.floor(quantity || 1)));

  // Render just ONE label - we only need one for preview
  // Pass entity info if provided for barcode rendering
  const entityInfo = entityType && entityId ? { entityType, entityId } : undefined;
  const labelResult = await renderLabelPreviewWithMeta(versionId, {
    elements,
    labelWidthIn,
    labelHeightIn
  }, entityInfo);
  
  // Calculate total sheets for decoration rendering
  const tempLayout = computeLetterSheetLayout(
    labelWidthIn ?? labelResult.meta.widthIn,
    labelHeightIn ?? labelResult.meta.heightIn,
    orientation,
    marginIn ?? LETTER_MARGIN_IN
  );
  const totalSheets = tempLayout.perSheet > 0 ? Math.ceil(qty / tempLayout.perSheet) : 1;
  
  // Use optimized preview: one real label + placeholder boxes
  // Pass label dimensions to override SVG-extracted dimensions if provided
  const { svg, meta } = composeLetterSheetPreview({ 
    labelSvg: labelResult.svg,
    totalLabels: qty,
    orientation,
    marginIn,
    labelWidthIn,
    labelHeightIn,
    decorations,
    sheetIndex: 0,
    totalSheets,
  });
  
  return {
    svg,
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

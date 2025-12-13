// LABEL SERVICE - Template management, versioning, and QR injection
// SVG is the source of truth - PDF rendering deferred to Phase 2

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { getLabelStorage, validateSvgPlaceholder, isAllowedFileType, getFileExtension } from './labelStorage';
import { ActivityEntity, LabelEntityType } from '@prisma/client';
import QRCode from 'qrcode';

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

// TODO: Consolidate render routes into a single endpoint once legacy paths are retired
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
    details: { name, entityType }
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
  
  // For SVG files, validate placeholder exists
  if (ext === '.svg') {
    const svgContent = file.toString('utf-8');
    if (!validateSvgPlaceholder(svgContent)) {
      throw new AppError(
        ErrorCodes.INVALID_INPUT,
        'SVG must contain a <g id="qr-placeholder"></g> element for QR code injection'
      );
    }
  }
  
  // Save file to storage
  const storage = getLabelStorage();
  const fileUrl = await storage.save(templateId, version, file, ext);
  
  // Create version record
  const templateVersion = await prisma.labelTemplateVersion.create({
    data: {
      templateId,
      version,
      fileUrl,
      qrTemplate,
      notes,
      isActive: false
    }
  });
  
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: templateId,
    action: 'label_version_uploaded',
    userId,
    summary: `Uploaded version ${version} of label template "${template.name}"`,
    details: {
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
    details: {
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
    details: {
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

// ========================================
// LABEL RENDERING
// ========================================

/**
 * Render a label SVG with QR code injection
 */
export async function renderLabelSvg(params: RenderLabelParams): Promise<string> {
  const { versionId, qrPayload } = params;
  
  // Get the version
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
  
  // Generate QR code as base64 data URL
  const qrDataUrl = await generateQRCode(qrPayload);
  
  // Inject QR code into placeholder
  svgContent = injectQRCode(svgContent, qrDataUrl);
  
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
    details: {
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
  token: string;  // Pre-generated QR token (e.g., "qr_2x7kP9mN4...")
  baseUrl: string;
}

/**
 * Render a label SVG with a token-based QR code
 * The QR code encodes only the token URL, not embedded data
 */
export async function renderLabelWithToken(params: RenderLabelWithTokenParams): Promise<string> {
  const { versionId, token, baseUrl } = params;
  
  // Get the version
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
  
  // Build the token URL
  const tokenUrl = `${baseUrl}/qr/${token}`;
  
  // Generate QR code from the simple URL
  const qrDataUrl = await generateQRCodeFromUrl(tokenUrl);
  
  // Inject QR code into placeholder
  svgContent = injectQRCode(svgContent, qrDataUrl);
  
  return svgContent;
}

/**
 * Render multiple labels with unique tokens
 * Used for sheet printing where each label needs its own token
 */
export async function renderLabelsWithTokens(params: {
  versionId: string;
  tokens: string[];  // Array of pre-generated tokens
  baseUrl: string;
}): Promise<string[]> {
  const { versionId, tokens, baseUrl } = params;
  
  // Get the version
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
  const svgTemplate = fileBuffer.toString('utf-8');
  
  // Render each label with its unique token
  const svgs: string[] = [];
  for (const token of tokens) {
    const tokenUrl = `${baseUrl}/qr/${token}`;
    const qrDataUrl = await generateQRCodeFromUrl(tokenUrl);
    const svgContent = injectQRCode(svgTemplate, qrDataUrl);
    svgs.push(svgContent);
  }
  
  return svgs;
}

/**
 * Generate a QR code from a simple URL string
 * Used for token-based QR codes
 */
async function generateQRCodeFromUrl(url: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(url, {
    width: 200,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    },
    errorCorrectionLevel: 'M'
  });
  
  return dataUrl;
}

// ========================================
// SHARED RENDER HELPER
// ========================================

// TODO: Consolidate render routes into a single endpoint once legacy paths are retired

/**
 * Shared helper for rendering labels in different modes
 * Used internally by both /api/labels/render and /api/labels/render-with-tokens
 * 
 * @param mode - 'embedded' for legacy JSON payload QR, 'token' for token-based QR
 */
export async function renderLabelsShared(params: RenderLabelsParams): Promise<RenderLabelsResult> {
  const { mode, versionId, entityType, entityId, quantity, userId, qrPayload, baseUrl } = params;

  // Get the version
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
  const svgTemplate = fileBuffer.toString('utf-8');

  if (mode === 'embedded') {
    // Legacy mode: Use embedded QR payload
    if (!qrPayload) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'qrPayload required for embedded mode');
    }

    const qrDataUrl = await generateQRCode(qrPayload);
    const svg = injectQRCode(svgTemplate, qrDataUrl);

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
    // IMPORTANT: Token creation happens HERE at render time
    if (!baseUrl) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'baseUrl required for token mode');
    }

    // Import dynamically to avoid circular dependency
    const { createTokenBatch, buildTokenUrl } = await import('./qrTokenService');

    const createdTokens = await createTokenBatch({
      entityType,
      entityId,
      versionId,
      quantity,
      userId
    });

    // Render each label with its unique token
    const svgs: string[] = [];
    for (const token of createdTokens) {
      const tokenUrl = `${baseUrl}/qr/${token.token}`;
      const qrDataUrl = await generateQRCodeFromUrl(tokenUrl);
      const svgContent = injectQRCode(svgTemplate, qrDataUrl);
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
// QR CODE GENERATION
// ========================================

/**
 * Generate a QR code as a base64 data URL
 */
async function generateQRCode(payload: QRPayload): Promise<string> {
  // Encode the structured payload as JSON
  const jsonPayload = JSON.stringify(payload);
  
  // Generate QR code as data URL
  const dataUrl = await QRCode.toDataURL(jsonPayload, {
    width: 200,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    },
    errorCorrectionLevel: 'M'
  });
  
  return dataUrl;
}

/**
 * Inject QR code into SVG placeholder
 */
function injectQRCode(svgContent: string, qrDataUrl: string): string {
  // Find the QR placeholder element
  const placeholderRegex = /<g\s+id="qr-placeholder"[^>]*>([\s\S]*?)<\/g>/i;
  const match = svgContent.match(placeholderRegex);
  
  if (!match) {
    // If no placeholder found, return original SVG
    console.warn('QR placeholder not found in SVG');
    return svgContent;
  }
  
  // Extract position from transform attribute if present
  const transformMatch = match[0].match(/transform="([^"]*)"/);
  const transform = transformMatch ? transformMatch[1] : '';
  
  // Create image element with QR code
  // Default size of 100x100, positioned at origin (transform handles placement)
  const qrImage = `<g id="qr-placeholder" ${transform ? `transform="${transform}"` : ''}>
    <image href="${qrDataUrl}" width="100" height="100" />
  </g>`;
  
  // Replace placeholder with QR image
  return svgContent.replace(placeholderRegex, qrImage);
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


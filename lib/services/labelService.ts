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

// ========================================
// LETTER SHEET CONSTANTS
// ========================================

const LETTER_WIDTH_IN = 8.5;
const LETTER_HEIGHT_IN = 11;
const LETTER_MARGIN_IN = 0.25;
const LETTER_USABLE_WIDTH_IN = LETTER_WIDTH_IN - 2 * LETTER_MARGIN_IN; // 8.0
const LETTER_USABLE_HEIGHT_IN = LETTER_HEIGHT_IN - 2 * LETTER_MARGIN_IN; // 10.5

// Auto-generated QR placeholder defaults
const QR_PLACEHOLDER_MARGIN_IN = 0.125;
const QR_PLACEHOLDER_SIZE_LARGE_IN = 0.75; // For labels >= 2in wide
const QR_PLACEHOLDER_SIZE_SMALL_IN = 0.5;  // For labels < 2in wide

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
  
  // For SVG files, check placeholder (but don't block - we auto-generate if missing)
  if (ext === '.svg') {
    const svgContent = file.toString('utf-8');
    if (!validateSvgPlaceholder(svgContent)) {
      // Log warning but allow upload - placeholder will be auto-generated at render time
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[labelService] SVG missing qr-placeholder for template ${templateId} - will auto-generate at render time`);
      }
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

/**
 * Update QR position settings for a label version
 * Does NOT regenerate tokens - only affects future renders
 */
export async function updateVersionQrPosition(
  versionId: string, 
  settings: {
    qrScale?: number;
    qrOffsetX?: number;
    qrOffsetY?: number;
    labelWidthIn?: number;
    labelHeightIn?: number;
    contentScale?: number;
    contentOffsetX?: number;
    contentOffsetY?: number;
  },
  userId?: string
) {
  const { qrScale, qrOffsetX, qrOffsetY, labelWidthIn, labelHeightIn, contentScale, contentOffsetX, contentOffsetY } = settings;

  // Validate scale range if provided (10% to 150%)
  if (qrScale !== undefined && (qrScale < 0.1 || qrScale > 1.5)) {
    throw new AppError(
      ErrorCodes.INVALID_INPUT, 
      'QR scale must be between 0.1 (10%) and 1.5 (150%)'
    );
  }

  const version = await fetchVersionWithSettings(versionId);

  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }

  const before = {
    qrScale: version.qrScale,
    qrOffsetX: version.qrOffsetX,
    qrOffsetY: version.qrOffsetY,
    labelWidthIn: version.labelWidthIn,
    labelHeightIn: version.labelHeightIn,
    contentScale: version.contentScale,
    contentOffsetX: version.contentOffsetX,
    contentOffsetY: version.contentOffsetY
  };

  // Build update data
  const updateData: any = {
    updatedAt: new Date()
  };
  
  if (qrScale !== undefined) updateData.qrScale = qrScale;
  if (qrOffsetX !== undefined) updateData.qrOffsetX = qrOffsetX;
  if (qrOffsetY !== undefined) updateData.qrOffsetY = qrOffsetY;
  if (labelWidthIn !== undefined) updateData.labelWidthIn = labelWidthIn;
  if (labelHeightIn !== undefined) updateData.labelHeightIn = labelHeightIn;
  if (contentScale !== undefined) updateData.contentScale = contentScale;
  if (contentOffsetX !== undefined) updateData.contentOffsetX = contentOffsetX;
  if (contentOffsetY !== undefined) updateData.contentOffsetY = contentOffsetY;

  // WORKAROUND: Use raw query because Prisma Client runtime might be stale and missing new fields
  // This bypasses the JS-level schema validation error: "Unknown argument labelWidthIn"
  const setClauses: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  const fields = [
    'qrScale', 'qrOffsetX', 'qrOffsetY', 
    'labelWidthIn', 'labelHeightIn', 
    'contentScale', 'contentOffsetX', 'contentOffsetY'
  ];

  fields.forEach(field => {
    if (updateData[field] !== undefined) {
      setClauses.push(`"${field}" = $${paramIdx++}`);
      params.push(updateData[field]);
    }
  });
  
  // Always update updatedAt
  setClauses.push(`"updatedAt" = $${paramIdx++}`);
  params.push(new Date());

  params.push(versionId); // ID is last param

  if (setClauses.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE "LabelTemplateVersion" SET ${setClauses.join(', ')} WHERE "id" = $${paramIdx}`,
      ...params
    );
  }

  // Construct updated object for return and logging (since we can't rely on stale client return)
  const updated = {
    ...version,
    ...updateData
  };

  // Build summary message
  const changes: string[] = [];
  if (qrScale !== undefined) changes.push(`QR scale to ${Math.round(qrScale * 100)}%`);
  if (qrOffsetX !== undefined) changes.push(`QR X to ${qrOffsetX}`);
  if (qrOffsetY !== undefined) changes.push(`QR Y to ${qrOffsetY}`);
  if (labelWidthIn !== undefined) changes.push(`Width to ${labelWidthIn}"`);
  if (contentScale !== undefined) changes.push(`Content scale to ${Math.round(contentScale * 100)}%`);

  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: version.templateId,
    action: 'label_settings_updated',
    userId,
    summary: `Updated settings for version ${version.version} of "${version.template.name}": ${changes.join(', ')}`,
    before,
    after: { 
      qrScale: updated.qrScale, 
      qrOffsetX: updated.qrOffsetX, 
      qrOffsetY: updated.qrOffsetY,
      labelWidthIn: updated.labelWidthIn,
      labelHeightIn: updated.labelHeightIn,
      contentScale: updated.contentScale,
      contentOffsetX: updated.contentOffsetX,
      contentOffsetY: updated.contentOffsetY
    },
    details: {
      versionId,
      version: version.version,
      templateName: version.template.name
    }
  });

  return updated;
}

// Alias for backward compatibility
export const updateVersionQrScale = (versionId: string, qrScale: number, userId?: string) => 
  updateVersionQrPosition(versionId, { qrScale }, userId);

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
 */
// Helper to fetch version with settings, handling potentially stale Prisma Client
async function fetchVersionWithSettings(versionId: string) {
  const version = await prisma.labelTemplateVersion.findUnique({
    where: { id: versionId },
    include: { template: true }
  });

  if (!version) return null;

  // Fallback for stale client: fetch new fields via raw query if missing
  if ((version as any).labelWidthIn === undefined) {
    try {
      const rawResult = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "labelWidthIn", "labelHeightIn", "contentScale", "contentOffsetX", "contentOffsetY" FROM "LabelTemplateVersion" WHERE "id" = $1`,
        versionId
      );
      
      if (rawResult && rawResult.length > 0) {
        const raw = rawResult[0];
        Object.assign(version, {
          labelWidthIn: raw.labelWidthIn,
          labelHeightIn: raw.labelHeightIn,
          contentScale: raw.contentScale,
          contentOffsetX: raw.contentOffsetX,
          contentOffsetY: raw.contentOffsetY
        });
      }
    } catch (e) {
      console.warn('Failed to fetch extended version settings via raw query:', e);
    }
  }

  return version;
}

export async function renderLabelSvg(params: RenderLabelParams): Promise<string> {
  const { versionId, qrPayload } = params;
  
  // Get the version
  const version = await fetchVersionWithSettings(versionId);
  
  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }
  
  // Load the SVG file
  const storage = getLabelStorage();
  const fileBuffer = await storage.load(version.fileUrl);
  let svgContent = fileBuffer.toString('utf-8');
  
  // Ensure QR placeholder exists (auto-generate if missing)
  svgContent = ensureQrPlaceholder(svgContent);
  
  // Apply persisted canvas adjustments (Size Override & Content Transform)
  // 1. Label Size Override
  if (version.labelWidthIn && version.labelHeightIn) {
    try {
      const { widthIn: nativeWidth, heightIn: nativeHeight } = getSvgPhysicalSizeInches(svgContent);
      svgContent = applyLabelSizeOverride(
        svgContent, 
        nativeWidth, 
        nativeHeight, 
        version.labelWidthIn, 
        version.labelHeightIn
      );
    } catch (e) {
      console.warn('Failed to apply label size override during render:', e);
    }
  }

  // 2. Content Transform (Scale/Offset)
  const contentScale = version.contentScale ?? 1.0;
  const contentOffsetX = version.contentOffsetX ?? 0;
  const contentOffsetY = version.contentOffsetY ?? 0;

  if (Math.abs(contentScale - 1.0) > 0.001 || Math.abs(contentOffsetX) > 0.001 || Math.abs(contentOffsetY) > 0.001) {
    try {
      const { widthIn, heightIn } = getSvgPhysicalSizeInches(svgContent);
      svgContent = applyContentTransform(
        svgContent, 
        contentOffsetX, 
        contentOffsetY, 
        widthIn, 
        heightIn, 
        contentScale
      );
    } catch (e) {
      console.warn('Failed to apply content transform during render:', e);
    }
  }

  // Generate QR code as SVG markup (vector)
  const qrSvg = await generateQrSvgFromUrl(qrPayload.url);
  
  // Inject QR code into placeholder with saved scale and offset
  svgContent = injectQRCode(svgContent, qrSvg, {
    scale: version.qrScale,
    offsetX: version.qrOffsetX,
    offsetY: version.qrOffsetY
  });
  
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
  
  // Ensure QR placeholder exists (auto-generate if missing)
  svgContent = ensureQrPlaceholder(svgContent);
  
  // Apply persisted canvas adjustments
  if (version.labelWidthIn && version.labelHeightIn) {
    try {
      const { widthIn: nativeWidth, heightIn: nativeHeight } = getSvgPhysicalSizeInches(svgContent);
      svgContent = applyLabelSizeOverride(svgContent, nativeWidth, nativeHeight, version.labelWidthIn, version.labelHeightIn);
    } catch {}
  }

  const contentScale = version.contentScale ?? 1.0;
  const contentOffsetX = version.contentOffsetX ?? 0;
  const contentOffsetY = version.contentOffsetY ?? 0;

  if (Math.abs(contentScale - 1.0) > 0.001 || Math.abs(contentOffsetX) > 0.001 || Math.abs(contentOffsetY) > 0.001) {
    try {
      const { widthIn, heightIn } = getSvgPhysicalSizeInches(svgContent);
      svgContent = applyContentTransform(svgContent, contentOffsetX, contentOffsetY, widthIn, heightIn, contentScale);
    } catch {}
  }

  // Build the token URL
  const tokenUrl = `${baseUrl}/qr/${token}`;
  
  // Generate QR code from the simple URL (vector SVG)
  const qrSvg = await generateQrSvgFromUrl(tokenUrl);
  
  // Inject QR code into placeholder with saved scale and offset
  svgContent = injectQRCode(svgContent, qrSvg, {
    scale: version.qrScale,
    offsetX: version.qrOffsetX,
    offsetY: version.qrOffsetY
  });
  
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
  let svgTemplate = fileBuffer.toString('utf-8');
  
  // Ensure QR placeholder exists (auto-generate if missing)
  svgTemplate = ensureQrPlaceholder(svgTemplate);
  
  // Apply persisted canvas adjustments
  if (version.labelWidthIn && version.labelHeightIn) {
    try {
      const { widthIn: nativeWidth, heightIn: nativeHeight } = getSvgPhysicalSizeInches(svgTemplate);
      svgTemplate = applyLabelSizeOverride(svgTemplate, nativeWidth, nativeHeight, version.labelWidthIn, version.labelHeightIn);
    } catch {}
  }

  const contentScale = version.contentScale ?? 1.0;
  const contentOffsetX = version.contentOffsetX ?? 0;
  const contentOffsetY = version.contentOffsetY ?? 0;

  if (Math.abs(contentScale - 1.0) > 0.001 || Math.abs(contentOffsetX) > 0.001 || Math.abs(contentOffsetY) > 0.001) {
    try {
      const { widthIn, heightIn } = getSvgPhysicalSizeInches(svgTemplate);
      svgTemplate = applyContentTransform(svgTemplate, contentOffsetX, contentOffsetY, widthIn, heightIn, contentScale);
    } catch {}
  }

  // Render each label with its unique token and saved scale/offset
  const qrOptions: QrPositionOptions = {
    scale: version.qrScale,
    offsetX: version.qrOffsetX,
    offsetY: version.qrOffsetY
  };
  
  const svgs: string[] = [];
  for (const token of tokens) {
    const tokenUrl = `${baseUrl}/qr/${token}`;
    const qrSvg = await generateQrSvgFromUrl(tokenUrl);
    const svgContent = injectQRCode(svgTemplate, qrSvg, qrOptions);
    svgs.push(svgContent);
  }
  
  return svgs;
}

/**
 * Generate a QR code SVG markup from a URL.
 * Hard rules:
 * - URL-only encoding
 * - errorCorrectionLevel: 'L'
 * - minimal quiet zone (margin)
 * - black on white
 * - vector SVG (no raster, no data URL)
 */
async function generateQrSvgFromUrl(url: string): Promise<string> {
  // qrcode library returns an <svg> string when type: 'svg'
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
  const version = await fetchVersionWithSettings(versionId);

  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }

  // Get entity code
  const entityCode = await getEntityCode(entityType, entityId);

  // Load the SVG template
  const storage = getLabelStorage();
  const fileBuffer = await storage.load(version.fileUrl);
  let svgTemplate = fileBuffer.toString('utf-8');
  
  // Ensure QR placeholder exists (auto-generate if missing)
  svgTemplate = ensureQrPlaceholder(svgTemplate);

  // Apply persisted canvas adjustments
  if (version.labelWidthIn != null && version.labelHeightIn != null) {
    try {
      const { widthIn: nativeWidth, heightIn: nativeHeight } = getSvgPhysicalSizeInches(svgTemplate);
      svgTemplate = applyLabelSizeOverride(svgTemplate, nativeWidth, nativeHeight, version.labelWidthIn, version.labelHeightIn);
    } catch {}
  }

  const contentScale = version.contentScale ?? 1.0;
  const contentOffsetX = version.contentOffsetX ?? 0;
  const contentOffsetY = version.contentOffsetY ?? 0;

  if (Math.abs(contentScale - 1.0) > 0.001 || Math.abs(contentOffsetX) > 0.001 || Math.abs(contentOffsetY) > 0.001) {
    try {
      const { widthIn, heightIn } = getSvgPhysicalSizeInches(svgTemplate);
      svgTemplate = applyContentTransform(svgTemplate, contentOffsetX, contentOffsetY, widthIn, heightIn, contentScale);
    } catch {}
  }

  // Build position options from version settings
  const qrOptions: QrPositionOptions = {
    scale: version.qrScale,
    offsetX: version.qrOffsetX,
    offsetY: version.qrOffsetY
  };

  if (mode === 'embedded') {
    // Legacy mode: Use embedded QR payload
    if (!qrPayload) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'qrPayload required for embedded mode');
    }

    // Embedded mode still uses URL-only QR and vector SVG for scan reliability.
    // NOTE: This keeps backward compatibility with the endpoint while improving QR output.
    const qrSvg = await generateQrSvgFromUrl(qrPayload.url);
    const svg = injectQRCode(svgTemplate, qrSvg, qrOptions);

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

    // Render each label with its unique token and saved scale/offset
    const svgs: string[] = [];
    for (const token of createdTokens) {
      const tokenUrl = `${baseUrl}/qr/${token.token}`;
      const qrSvg = await generateQrSvgFromUrl(tokenUrl);
      const svgContent = injectQRCode(svgTemplate, qrSvg, qrOptions);
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
// PREVIEW MODE HELPERS
// ========================================

/**
 * Extract bounding box from <g id="qr-placeholder"> element
 * Designers must add data-width and data-height attributes to the placeholder group
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

  // Also try reverse attribute order (data attrs before transform)
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

  // Fallback: try to find placeholder without data attributes (use default 100x100)
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

  // Final fallback: placeholder exists but no transform
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

function getSvgPhysicalSizeInches(svg: string): { widthIn: number; heightIn: number } {
  // Find the root <svg ... > tag content to avoid matching nested elements
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
      // Assuming 96 DPI for unitless viewBox dimensions (standard CSS px)
      // This is a heuristic; some tools use 72 DPI, but 96 is safer for web consistency
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

/**
 * Check if SVG has a qr-placeholder element
 */
function hasQrPlaceholder(svg: string): boolean {
  return svg.includes('id="qr-placeholder"');
}

/**
 * Ensure SVG has a QR placeholder, auto-generating one if missing.
 * 
 * If the SVG already has <g id="qr-placeholder">, returns unchanged.
 * Otherwise, injects a fallback placeholder positioned at bottom-right corner.
 * 
 * Placement rules:
 * - Bottom-right corner with 0.125in margin from edges
 * - QR size: 0.75in if label width >= 2in, else 0.5in
 * - Uses SVG viewBox coordinates if available, otherwise physical units
 */
function ensureQrPlaceholder(svg: string): string {
  // If placeholder already exists, return unchanged
  if (hasQrPlaceholder(svg)) {
    return svg;
  }

  // Dev-only console warning
  if (process.env.NODE_ENV === 'development') {
    console.warn('[labelService] SVG missing qr-placeholder - auto-generating fallback');
  }

  // Get SVG dimensions
  let widthIn: number;
  let heightIn: number;
  
  try {
    const size = getSvgPhysicalSizeInches(svg);
    widthIn = size.widthIn;
    heightIn = size.heightIn;
  } catch {
    // Fallback to default 2x2 inches if size detection fails
    widthIn = 2;
    heightIn = 2;
  }

  // Determine QR size based on label width
  const qrSizeIn = widthIn >= 2 ? QR_PLACEHOLDER_SIZE_LARGE_IN : QR_PLACEHOLDER_SIZE_SMALL_IN;
  
  // Calculate position (bottom-right corner with margin)
  const marginIn = QR_PLACEHOLDER_MARGIN_IN;
  
  // Get viewBox to determine coordinate system
  const viewBoxMatch = svg.match(/\bviewBox="([^"]+)"/i);
  
  let qrSize: number;
  let qrX: number;
  let qrY: number;
  
  if (viewBoxMatch) {
    // Use viewBox coordinate system
    const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
    if (parts.length >= 4) {
      const [, , vbWidth, vbHeight] = parts;
      // Scale QR size and margin to viewBox units
      const scaleX = vbWidth / widthIn;
      const scaleY = vbHeight / heightIn;
      qrSize = qrSizeIn * Math.min(scaleX, scaleY);
      const marginX = marginIn * scaleX;
      const marginY = marginIn * scaleY;
      qrX = vbWidth - qrSize - marginX;
      qrY = vbHeight - qrSize - marginY;
    } else {
      // Fallback: use inches directly (96 DPI)
      qrSize = qrSizeIn * 96;
      qrX = (widthIn - qrSizeIn - marginIn) * 96;
      qrY = (heightIn - qrSizeIn - marginIn) * 96;
    }
  } else {
    // No viewBox - use physical units (convert to pixels at 96 DPI)
    qrSize = qrSizeIn * 96;
    qrX = (widthIn - qrSizeIn - marginIn) * 96;
    qrY = (heightIn - qrSizeIn - marginIn) * 96;
  }

  // Build the auto-generated placeholder group
  const placeholderGroup = `
  <g id="qr-placeholder" data-auto-generated="true" transform="translate(${qrX.toFixed(3)}, ${qrY.toFixed(3)})" data-width="${qrSize.toFixed(3)}" data-height="${qrSize.toFixed(3)}">
    <rect
      x="0"
      y="0"
      width="${qrSize.toFixed(3)}"
      height="${qrSize.toFixed(3)}"
      fill="#ffffff"
      stroke="#000000"
      stroke-width="0.02"
      rx="0.05"
    />
    <text
      x="${(qrSize / 2).toFixed(3)}"
      y="${(qrSize / 2).toFixed(3)}"
      dominant-baseline="middle"
      text-anchor="middle"
      font-size="${(qrSize * 0.12).toFixed(3)}"
      fill="#666666"
      font-family="sans-serif"
    >QR</text>
  </g>`;

  // Inject before closing </svg> tag
  return svg.replace(/<\/svg>\s*$/i, `${placeholderGroup}\n</svg>`);
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

  // Critical: multiple embedded label instances will otherwise collide on SVG IDs
  // (gradients, clipPaths, masks, etc.) causing unpredictable rendering.
  // Prefix ids
  let out = svg.replace(/\bid="([^"]+)"/g, (full, id) => {
    if (String(id).startsWith(p)) return full;
    return `id="${p}${id}"`;
  });

  // url(#...)
  out = out.replace(/url\(#([^)]+)\)/g, (full, id) => {
    if (String(id).startsWith(p)) return full;
    return `url(#${p}${id})`;
  });

  // href="#..." and xlink:href="#..."
  out = out.replace(/\b(xlink:href|href)="#([^"]+)"/g, (full, attr, id) => {
    if (String(id).startsWith(p)) return full;
    return `${attr}="#${p}${id}"`;
  });

  return out;
}

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
        // Rotate around top-left of the placed cell; after rotating, translate to keep in-bounds.
        // cellWidthIn = labelHeightIn, cellHeightIn = labelWidthIn
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

/**
 * QR positioning options
 */
interface QrPositionOptions {
  scale?: number;    // Scale factor (0.1 - 1.5), defaults to 1.0
  offsetX?: number;  // Horizontal offset in SVG units (positive = right)
  offsetY?: number;  // Vertical offset in SVG units (positive = down)
}

/**
 * Inject a QR SVG markup with optional scaling and position offset
 * 
 * @param svg - The SVG template content
 * @param qrSvg - The QR SVG markup (full <svg>...</svg>)
 * @param options - Scale and offset options
 */
function injectQrWithScale(svg: string, qrSvg: string, options: QrPositionOptions = {}): string {
  const box = extractPlaceholderBox(svg);

  if (!box) {
    throw new AppError(
      ErrorCodes.INVALID_INPUT,
      'QR placeholder bounding box not found. Ensure SVG has <g id="qr-placeholder"> element.'
    );
  }

  // Extract options with defaults
  const { scale: qrScale = 1.0, offsetX: userOffsetX = 0, offsetY: userOffsetY = 0 } = options;

  // Clamp scale to valid range (10% to 150%)
  const scale = Math.max(0.1, Math.min(1.5, qrScale));

  // Calculate scaled dimensions
  const scaledWidth = box.width * scale;
  const scaledHeight = box.height * scale;

  // Center the scaled QR within the original placeholder bounds, then apply user offset
  const finalX = box.x + (box.width - scaledWidth) / 2 + userOffsetX;
  const finalY = box.y + (box.height - scaledHeight) / 2 + userOffsetY;

  // Extract viewBox size and inner content from QR SVG
  const vbMatch = qrSvg.match(/\bviewBox="0 0 ([0-9.]+) ([0-9.]+)"/i);
  const size = vbMatch ? parseFloat(vbMatch[1]) : 0;
  const inner = stripOuterSvg(qrSvg);

  const qrNestedSvg = `
    <svg x="${finalX}" y="${finalY}" width="${scaledWidth}" height="${scaledHeight}"${size ? ` viewBox="0 0 ${size} ${size}"` : ''} shape-rendering="crispEdges">
      ${inner}
    </svg>
  `;

  // Replace the placeholder group content with the image
  return svg.replace(
    /<g[^>]*id="qr-placeholder"[^>]*>[\s\S]*?<\/g>/i,
    `<g id="qr-placeholder">${qrNestedSvg}</g>`
  );
}

/**
 * Inject a placeholder PNG image for preview mode
 * Uses <image> tag instead of nested SVG for PNG support
 */
function injectPlaceholderImage(svg: string, imagePath: string, options: QrPositionOptions = {}): string {
  const box = extractPlaceholderBox(svg);

  if (!box) {
    throw new AppError(
      ErrorCodes.INVALID_INPUT,
      'QR placeholder bounding box not found. Ensure SVG has <g id="qr-placeholder"> element.'
    );
  }

  // Extract options with defaults
  const { scale: qrScale = 1.0, offsetX: userOffsetX = 0, offsetY: userOffsetY = 0 } = options;

  // Clamp scale to valid range (10% to 150%)
  const scale = Math.max(0.1, Math.min(1.5, qrScale));

  // Calculate scaled dimensions
  const scaledWidth = box.width * scale;
  const scaledHeight = box.height * scale;

  // Center the scaled image within the original placeholder bounds, then apply user offset
  const finalX = box.x + (box.width - scaledWidth) / 2 + userOffsetX;
  const finalY = box.y + (box.height - scaledHeight) / 2 + userOffsetY;

  const imageTag = `
    <image
      href="${imagePath}"
      x="${finalX}"
      y="${finalY}"
      width="${scaledWidth}"
      height="${scaledHeight}"
      preserveAspectRatio="xMidYMid meet"
    />
  `;

  // Replace the placeholder group content with the image
  return svg.replace(
    /<g[^>]*id="qr-placeholder"[^>]*>[\s\S]*?<\/g>/i,
    `<g id="qr-placeholder">${imageTag}</g>`
  );
}

// ========================================
// LABEL METADATA
// ========================================

export interface LabelMetadata {
  widthIn: number;
  heightIn: number;
  hasPlaceholder: boolean;
  placeholderBox: { x: number; y: number; width: number; height: number } | null;
  isAutoGenerated: boolean;
}

export interface LabelPreviewResult {
  svg: string;
  meta: LabelMetadata;
}

/**
 * Get label metadata from an SVG file
 * Returns dimensions, placeholder info, and whether placeholder was auto-generated
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

  // Check if original SVG has placeholder
  const hasPlaceholder = svgContent.includes('id="qr-placeholder"');

  // Get dimensions
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

  // Ensure placeholder exists for extraction
  const svgWithPlaceholder = ensureQrPlaceholder(svgContent);
  const placeholderBox = extractPlaceholderBox(svgWithPlaceholder);
  
  // Check if placeholder was auto-generated
  const isAutoGenerated = svgWithPlaceholder.includes('data-auto-generated="true"');

  return {
    widthIn,
    heightIn,
    hasPlaceholder,
    placeholderBox,
    isAutoGenerated
  };
}

/**
 * Render a label preview with placeholder QR code
 * No entity lookup, no QR token generation - safe preview-only logic
 * 
 * @param versionId - The label version ID
 * @param overrides - Optional overrides for live preview (uses saved values if not provided)
 */
export async function renderLabelPreview(
  versionId: string, 
  overrides?: { qrScale?: number; qrOffsetX?: number; qrOffsetY?: number }
): Promise<string> {
  const result = await renderLabelPreviewWithMeta(versionId, overrides);
  return result.svg;
}

/**
 * Render a label preview with metadata
 * Returns both the SVG and label metadata in a single call
 * 
 * Label size override is treated as a layout instruction applied at render time.
 * The original SVG remains unchanged in storage.
 */
export async function renderLabelPreviewWithMeta(
  versionId: string, 
  overrides?: { 
    qrScale?: number; 
    qrOffsetX?: number; 
    qrOffsetY?: number; 
    labelWidthIn?: number; 
    labelHeightIn?: number;
    contentOffsetX?: number;
    contentOffsetY?: number;
    contentScale?: number;
  }
): Promise<LabelPreviewResult> {
  const version = await fetchVersionWithSettings(versionId);

  if (!version) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Label version not found');
  }

  // Load the SVG template
  const storage = getLabelStorage();
  const fileBuffer = await storage.load(version.fileUrl);
  const originalSvg = fileBuffer.toString('utf-8');
  
  // Check if original has placeholder before processing
  const hasPlaceholder = originalSvg.includes('id="qr-placeholder"');
  
  // Ensure QR placeholder exists (auto-generate if missing)
  let svgContent = ensureQrPlaceholder(originalSvg);
  const isAutoGenerated = svgContent.includes('data-auto-generated="true"');

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

  // Apply label size override at render time (non-destructive)
  // The original SVG is wrapped/scaled, never mutated
  // Priority: 1. Runtime override, 2. Persisted setting, 3. Native SVG size
  const finalWidthIn = overrides?.labelWidthIn ?? version.labelWidthIn ?? nativeWidthIn;
  const finalHeightIn = overrides?.labelHeightIn ?? version.labelHeightIn ?? nativeHeightIn;
  
  // Apply size override if it differs from native
  if (Math.abs(finalWidthIn - nativeWidthIn) > 0.001 || Math.abs(finalHeightIn - nativeHeightIn) > 0.001) {
    svgContent = applyLabelSizeOverride(svgContent, nativeWidthIn, nativeHeightIn, finalWidthIn, finalHeightIn);
  }

  // Determine content transform values
  // Priority: 1. Runtime override, 2. Persisted setting, 3. Default (0 or 1.0)
  const contentOffsetX = overrides?.contentOffsetX ?? version.contentOffsetX ?? 0;
  const contentOffsetY = overrides?.contentOffsetY ?? version.contentOffsetY ?? 0;
  const contentScale = overrides?.contentScale ?? version.contentScale ?? 1.0;

  // Apply content offset (placement) and scale if needed
  if (Math.abs(contentOffsetX) > 0.001 || Math.abs(contentOffsetY) > 0.001 || Math.abs(contentScale - 1.0) > 0.001) {
    svgContent = applyContentTransform(
      svgContent, 
      contentOffsetX, 
      contentOffsetY, 
      finalWidthIn, 
      finalHeightIn,
      contentScale
    );
  }

  // Extract placeholder box after any transformations
  const placeholderBox = extractPlaceholderBox(svgContent);

  // Use overrides if provided, otherwise use saved values from version
  const qrOptions: QrPositionOptions = {
    scale: overrides?.qrScale ?? version.qrScale,
    offsetX: overrides?.qrOffsetX ?? version.qrOffsetX,
    offsetY: overrides?.qrOffsetY ?? version.qrOffsetY
  };

  // Preview uses the colorful placeholder PNG to clearly indicate it's not a real QR
  const svg = injectPlaceholderImage(svgContent, '/labels/placeholder-qr.png', qrOptions);

  return {
    svg,
    meta: {
      widthIn: finalWidthIn,
      heightIn: finalHeightIn,
      hasPlaceholder,
      placeholderBox,
      isAutoGenerated
    }
  };
}

/**
 * Apply label size override at render time (non-destructive)
 * Wraps the original SVG content to scale it to new dimensions
 * Original SVG templates are never mutated.
 */
function applyLabelSizeOverride(
  svg: string, 
  nativeWidthIn: number, 
  nativeHeightIn: number,
  targetWidthIn: number, 
  targetHeightIn: number
): string {
  // If same size, return unchanged
  if (Math.abs(nativeWidthIn - targetWidthIn) < 0.001 && Math.abs(nativeHeightIn - targetHeightIn) < 0.001) {
    return svg;
  }

  // Extract viewBox or calculate from dimensions
  const viewBoxMatch = svg.match(/\bviewBox="([^"]+)"/i);
  let viewBox: string;
  
  if (viewBoxMatch) {
    viewBox = viewBoxMatch[1];
  } else {
    // Estimate viewBox from physical dimensions (assume 96 DPI)
    const vbWidth = nativeWidthIn * 96;
    const vbHeight = nativeHeightIn * 96;
    viewBox = `0 0 ${vbWidth} ${vbHeight}`;
  }

  // Update width and height attributes to new dimensions
  let result = svg.replace(/\bwidth="[^"]+"/i, `width="${targetWidthIn}in"`);
  result = result.replace(/\bheight="[^"]+"/i, `height="${targetHeightIn}in"`);
  
  // Add or update viewBox to preserve content scaling
  if (!viewBoxMatch) {
    result = result.replace(/<svg([^>]*)>/i, `<svg$1 viewBox="${viewBox}">`);
  }

  return result;
}

/**
 * Apply content translation (offset) to the SVG.
 * Wraps content in a <g transform="translate(dx, dy)">
 */
function applyContentTransform(
  svg: string, 
  offsetXIn: number, 
  offsetYIn: number, 
  widthIn: number, 
  heightIn: number,
  scale: number = 1.0
): string {
  if (Math.abs(offsetXIn) < 0.001 && Math.abs(offsetYIn) < 0.001 && Math.abs(scale - 1.0) < 0.001) {
    return svg;
  }

  const viewBox = extractViewBox(svg);
  let scaleX = 96;
  let scaleY = 96;
  let vbWidth = widthIn * 96;
  let vbHeight = heightIn * 96;

  // Calculate pixels/units per inch based on viewBox
  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(parseFloat);
    if (parts.length >= 4) {
      // Width/Height in user units
      vbWidth = parts[2];
      vbHeight = parts[3];
      
      // Scale = units / inches
      if (widthIn > 0) scaleX = vbWidth / widthIn;
      if (heightIn > 0) scaleY = vbHeight / heightIn;
    }
  }

  const dx = offsetXIn * scaleX;
  const dy = offsetYIn * scaleY;
  
  // Center of the viewBox for scaling
  const cx = vbWidth / 2;
  const cy = vbHeight / 2;

  const innerContent = stripOuterSvg(svg);
  
  // Reconstruct SVG with transform wrapper
  const finalViewBox = viewBox || `0 0 ${widthIn * 96} ${heightIn * 96}`;

  // Apply translate(dx, dy) for offset
  // Apply translate(cx, cy) scale(s) translate(-cx, -cy) for centered scaling
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${widthIn}in" height="${heightIn}in" viewBox="${finalViewBox}">
  <g transform="translate(${dx.toFixed(3)}, ${dy.toFixed(3)}) translate(${cx.toFixed(3)}, ${cy.toFixed(3)}) scale(${scale}) translate(-${cx.toFixed(3)}, -${cy.toFixed(3)})">
    ${innerContent}
  </g>
</svg>`;
}

/**
 * Legacy: Render a mm-based manual grid preview (deprecated).
 */
export async function renderLabelSheetPreview(params: {
  versionId: string;
  columns: number;
  rows: number;
  gapMm?: number;
  labelWidthMm?: number;
  labelHeightMm?: number;
  qrScale?: number;
  qrOffsetX?: number;
  qrOffsetY?: number;
}): Promise<string> {
  const { versionId, columns, rows, gapMm = 4, labelWidthMm = 100, labelHeightMm = 100, qrScale, qrOffsetX, qrOffsetY } = params;

  // Get single label preview with optional overrides
  const singleLabel = await renderLabelPreview(versionId, { qrScale, qrOffsetX, qrOffsetY });

  // Extract viewBox dimensions from the single label SVG
  const viewBoxMatch = singleLabel.match(/viewBox="([^"]+)"/);
  let singleWidth = labelWidthMm;
  let singleHeight = labelHeightMm;

  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/);
    if (parts.length >= 4) {
      singleWidth = parseFloat(parts[2]) || labelWidthMm;
      singleHeight = parseFloat(parts[3]) || labelHeightMm;
    }
  }

  // Build grid of labels
  let content = '';
  const gap = gapMm;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x = c * (singleWidth + gap);
      const y = r * (singleHeight + gap);

      // Strip the outer SVG wrapper and just use the content
      const innerContent = singleLabel
        .replace(/<\?xml[^?]*\?>/i, '')
        .replace(/<svg[^>]*>/i, '')
        .replace(/<\/svg>/i, '');

      content += `
        <g transform="translate(${x}, ${y})">
          ${innerContent}
        </g>
      `;
    }
  }

  // Calculate total sheet dimensions
  const totalWidth = columns * singleWidth + (columns - 1) * gap;
  const totalHeight = rows * singleHeight + (rows - 1) * gap;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="0 0 ${totalWidth} ${totalHeight}"
     width="${totalWidth}mm"
     height="${totalHeight}mm">
  ${content}
</svg>`;
}

export interface LetterSheetPreviewResult {
  svg: string;
  meta: LetterSheetLayoutMeta;
  labelMeta: LabelMetadata;
}

/**
 * Render an auto-tiled letter-size sheet preview (first sheet only).
 * Hard rules:
 * - uses dummy token URL (no token creation)
 * - uses the same tiling logic as printing
 * - label size override is treated as a layout instruction applied at render time
 * - original SVG templates are never mutated
 */
export async function renderLetterSheetPreview(params: {
  versionId: string;
  quantity: number;
  qrScale?: number;
  qrOffsetX?: number;
  qrOffsetY?: number;
  labelWidthIn?: number;
  labelHeightIn?: number;
  contentOffsetX?: number;
  contentOffsetY?: number;
  contentScale?: number;
}): Promise<LetterSheetPreviewResult> {
  const { versionId, quantity, qrScale, qrOffsetX, qrOffsetY, labelWidthIn, labelHeightIn, contentOffsetX, contentOffsetY, contentScale } = params;
  const qty = Math.max(1, Math.min(1000, Math.floor(quantity || 1)));

  // Get label preview with metadata (includes size override handling)
  const labelResult = await renderLabelPreviewWithMeta(versionId, { 
    qrScale, 
    qrOffsetX, 
    qrOffsetY,
    labelWidthIn,
    labelHeightIn,
    contentOffsetX,
    contentOffsetY,
    contentScale
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
// QR CODE GENERATION
// ========================================

/**
 * Inject QR SVG into SVG placeholder with optional scaling and offset
 * This is a wrapper around injectQrWithScale for production rendering
 */
function injectQRCode(svgContent: string, qrSvg: string, options: QrPositionOptions = {}): string {
  try {
    return injectQrWithScale(svgContent, qrSvg, options);
  } catch {
    // Fallback for legacy SVGs without proper placeholder structure
    console.warn('QR placeholder structure not found, using legacy injection');
    
    const placeholderRegex = /<g\s+id="qr-placeholder"[^>]*>([\s\S]*?)<\/g>/i;
    const match = svgContent.match(placeholderRegex);
    
    if (!match) {
      console.warn('QR placeholder not found in SVG');
      return svgContent;
    }
    
    const transformMatch = match[0].match(/transform="([^"]*)"/);
    const transform = transformMatch ? transformMatch[1] : '';
    
    // Apply scale to default 100x100 size
    const qrScale = options.scale ?? 1.0;
    const scale = Math.max(0.1, Math.min(1.5, qrScale));
    const size = 100 * scale;
    const centerOffset = (100 - size) / 2;
    
    // Apply user offsets
    const finalX = centerOffset + (options.offsetX ?? 0);
    const finalY = centerOffset + (options.offsetY ?? 0);
    
    const vbMatch = qrSvg.match(/\bviewBox="0 0 ([0-9.]+) ([0-9.]+)"/i);
    const qrSize = vbMatch ? parseFloat(vbMatch[1]) : 0;
    const inner = stripOuterSvg(qrSvg);
    const qrNestedSvg = `<svg x="${finalX}" y="${finalY}" width="${size}" height="${size}"${qrSize ? ` viewBox="0 0 ${qrSize} ${qrSize}"` : ''} shape-rendering="crispEdges">${inner}</svg>`;
    const qrImage = `<g id="qr-placeholder" ${transform ? `transform="${transform}"` : ''}>
      ${qrNestedSvg}
    </g>`;
    
    return svgContent.replace(placeholderRegex, qrImage);
  }
}

// ========================================
// SMART QR PLACEMENT (Preview Only)
// ========================================

// Re-export client-safe QR placement utilities for backwards compatibility
// These are defined in lib/utils/qrPlacement.ts (can be imported by client components)
export {
  suggestQrPlacement,
  calculateMaxQrSize,
  findLargestEmptyRegion,
  qrBoxToOffsetScale,
  offsetScaleToQrBox,
  type QrBoxPosition,
  type SuggestedRegion,
} from '@/lib/utils/qrPlacement';

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


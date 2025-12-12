// AI INGEST SERVICE
// Handles document-based imports (invoices, receipts, packing slips, etc.)

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { parseDocumentContent, AIClientError, RawAICommandResult } from './aiClient';
import { executeInterpretedCommand, AICommandInterpretation } from './aiCommandService';
import { ActivityEntity } from '@prisma/client';
import { AIDocumentStatus } from '@/lib/types/enums';

// ========================================
// TYPES
// ========================================

export type SourceType = 'UPLOAD' | 'PASTE' | 'EMAIL';

export interface DocumentImportFilters {
  status?: string;
  userId?: string;
  sourceType?: SourceType;
  limit?: number;
  offset?: number;
}

export interface DocumentImportSummary {
  id: string;
  sourceType: string;
  originalName: string | null;
  status: string;
  confidence: number | null;
  createdAt: Date;
  appliedAt: Date | null;
  error: string | null;
  commandCount: number;
  user?: {
    id: string;
    name: string;
  } | null;
}

export interface ApplyResult {
  success: boolean;
  message: string;
  appliedCommands: number;
  failedCommands: number;
  results: {
    command: string;
    success: boolean;
    message: string;
  }[];
}

// ========================================
// CREATE DOCUMENT IMPORT
// ========================================

/**
 * Create a new document import from text content
 */
export async function createDocumentImport(
  text: string,
  sourceType: SourceType,
  userId?: string | null,
  originalName?: string,
  contentType?: string
): Promise<any> {
  // Truncate text preview
  const textPreview = text.length > 500 ? text.substring(0, 500) + '...' : text;

  let aiResult: any = null;
  let confidence: number | null = null;
  let status = AIDocumentStatus.PENDING_REVIEW;
  let error: string | null = null;

  try {
    // Attempt to parse with AI
    const parseResult = await parseDocumentContent(text, `sourceType: ${sourceType}`);
    aiResult = parseResult;
    confidence = parseResult.confidence || null;
    status = AIDocumentStatus.PARSED;
  } catch (err) {
    if (err instanceof AIClientError) {
      // AI not configured - store for manual review
      error = 'AI parsing not available: ' + err.message;
      status = AIDocumentStatus.PENDING_REVIEW;
      
      // Create a placeholder aiResult with empty commands
      aiResult = {
        type: 'unknown',
        commands: [],
        confidence: 0,
        notes: 'AI parsing not configured. Manual command entry required.'
      };
    } else {
      throw err;
    }
  }

  // Create the document import record
  const docImport = await prisma.aIDocumentImport.create({
    data: {
      userId: userId || null,
      sourceType,
      originalName: originalName || null,
      contentType: contentType || null,
      textPreview,
      status,
      confidence,
      aiResult,
      error,
    },
    include: {
      user: { select: { id: true, name: true } }
    }
  });

  // Log the creation
  await logAction({
    entityType: ActivityEntity.SYSTEM,
    entityId: docImport.id,
    action: 'ai_document_created',
    userId: userId || undefined,
    summary: `Document import created (${sourceType})`,
    details: {
      sourceType,
      originalName,
      commandCount: aiResult?.commands?.length || 0,
      confidence,
    },
    tags: ['ai_ingest', 'document', 'created'],
  });

  return docImport;
}

// ========================================
// LIST DOCUMENT IMPORTS
// ========================================

/**
 * List document imports with filters
 */
export async function listDocumentImports(
  filters: DocumentImportFilters = {}
): Promise<{ items: DocumentImportSummary[]; total: number }> {
  const where: any = {};

  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.userId) {
    where.userId = filters.userId;
  }
  if (filters.sourceType) {
    where.sourceType = filters.sourceType;
  }

  const [items, total] = await Promise.all([
    prisma.aIDocumentImport.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    }),
    prisma.aIDocumentImport.count({ where })
  ]);

  return {
    items: items.map(item => ({
      id: item.id,
      sourceType: item.sourceType,
      originalName: item.originalName,
      status: item.status,
      confidence: item.confidence,
      createdAt: item.createdAt,
      appliedAt: item.appliedAt,
      error: item.error,
      commandCount: (item.aiResult as any)?.commands?.length || 0,
      user: item.user,
    })),
    total,
  };
}

// ========================================
// GET DOCUMENT IMPORT
// ========================================

/**
 * Get a single document import by ID
 */
export async function getDocumentImport(id: string) {
  const docImport = await prisma.aIDocumentImport.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } }
    }
  });

  if (!docImport) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Document import not found');
  }

  return docImport;
}

// ========================================
// APPLY DOCUMENT IMPORT
// ========================================

/**
 * Apply all commands from a document import
 */
export async function applyDocumentImport(
  id: string,
  userId?: string | null
): Promise<ApplyResult> {
  const docImport = await getDocumentImport(id);

  // Validate status
  if (docImport.status === AIDocumentStatus.APPLIED) {
    throw new AppError(ErrorCodes.INVALID_STATUS, 'Document has already been applied');
  }
  if (docImport.status === AIDocumentStatus.REJECTED) {
    throw new AppError(ErrorCodes.INVALID_STATUS, 'Document has been rejected');
  }

  const aiResult = docImport.aiResult as any;
  const commands: RawAICommandResult[] = aiResult?.commands || [];

  if (commands.length === 0) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'No commands found in document. Manual command entry may be required.'
    );
  }

  const results: { command: string; success: boolean; message: string }[] = [];
  let appliedCommands = 0;
  let failedCommands = 0;

  // Execute each command
  for (const rawCmd of commands) {
    try {
      // Map to typed command
      const interpreted = await mapRawCommandToInterpreted(rawCmd);
      
      // Execute
      const result = await executeInterpretedCommand(interpreted, {
        userId,
        logId: null, // We create logs for each command separately
      });

      results.push({
        command: rawCmd.command,
        success: result.success,
        message: result.message,
      });

      if (result.success) {
        appliedCommands++;
      } else {
        failedCommands++;
      }
    } catch (error: any) {
      results.push({
        command: rawCmd.command,
        success: false,
        message: error.message || 'Unknown error',
      });
      failedCommands++;
    }
  }

  // Update document status
  const finalStatus = failedCommands === 0 
    ? AIDocumentStatus.APPLIED 
    : (appliedCommands === 0 ? AIDocumentStatus.FAILED : AIDocumentStatus.APPLIED);

  const errorSummary = failedCommands > 0 
    ? `${failedCommands} of ${commands.length} commands failed` 
    : null;

  await prisma.aIDocumentImport.update({
    where: { id },
    data: {
      status: finalStatus,
      appliedAt: new Date(),
      error: errorSummary,
    }
  });

  // Log the application
  await logAction({
    entityType: ActivityEntity.SYSTEM,
    entityId: id,
    action: 'ai_document_applied',
    userId: userId || undefined,
    summary: `Document import applied: ${appliedCommands}/${commands.length} commands successful`,
    details: {
      documentType: aiResult?.type,
      appliedCommands,
      failedCommands,
      results,
    },
    tags: ['ai_ingest', 'document', aiResult?.type || 'unknown'],
  });

  return {
    success: failedCommands === 0,
    message: failedCommands === 0 
      ? `Successfully applied ${appliedCommands} command(s)` 
      : `Applied ${appliedCommands} command(s), ${failedCommands} failed`,
    appliedCommands,
    failedCommands,
    results,
  };
}

// ========================================
// REJECT DOCUMENT IMPORT
// ========================================

/**
 * Reject a document import
 */
export async function rejectDocumentImport(
  id: string,
  reason?: string,
  userId?: string | null
): Promise<any> {
  const docImport = await getDocumentImport(id);

  // Validate status
  if (docImport.status === AIDocumentStatus.APPLIED) {
    throw new AppError(ErrorCodes.INVALID_STATUS, 'Cannot reject an already applied document');
  }
  if (docImport.status === AIDocumentStatus.REJECTED) {
    throw new AppError(ErrorCodes.INVALID_STATUS, 'Document has already been rejected');
  }

  // Update status
  const updated = await prisma.aIDocumentImport.update({
    where: { id },
    data: {
      status: AIDocumentStatus.REJECTED,
      reviewedAt: new Date(),
      error: reason || 'Rejected by user',
    },
    include: {
      user: { select: { id: true, name: true } }
    }
  });

  // Log the rejection
  await logAction({
    entityType: ActivityEntity.SYSTEM,
    entityId: id,
    action: 'ai_document_rejected',
    userId: userId || undefined,
    summary: `Document import rejected${reason ? ': ' + reason : ''}`,
    details: {
      reason,
      sourceType: updated.sourceType,
    },
    tags: ['ai_ingest', 'document', 'rejected'],
  });

  return updated;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Map a raw command result to a typed AICommandInterpretation
 * This is a simplified version - the full resolution happens in executeInterpretedCommand
 */
async function mapRawCommandToInterpreted(
  raw: RawAICommandResult
): Promise<AICommandInterpretation> {
  const cmd = raw.command.toUpperCase();
  const args = raw.args;

  switch (cmd) {
    case 'RECEIVE_MATERIAL':
      return {
        command: 'RECEIVE_MATERIAL',
        args: {
          materialRef: args.materialRef || args.material || '',
          quantity: Number(args.quantity || 0),
          unit: args.unit || 'UNIT',
          locationRef: args.locationRef || args.location,
          lotNumber: args.lotNumber || args.lot,
          expiryDate: args.expiryDate || args.expiry,
          vendorRef: args.vendorRef || args.vendor,
          note: args.note,
        }
      };

    case 'MOVE_INVENTORY':
      return {
        command: 'MOVE_INVENTORY',
        args: {
          itemRef: args.itemRef || args.item || '',
          quantity: Number(args.quantity || 0),
          toLocationRef: args.toLocationRef || args.toLocation || args.destination || '',
          note: args.note,
        }
      };

    case 'ADJUST_INVENTORY':
      return {
        command: 'ADJUST_INVENTORY',
        args: {
          itemRef: args.itemRef || args.item || '',
          delta: Number(args.delta || args.adjustment || 0),
          reason: args.reason || 'Document import',
        }
      };

    case 'CREATE_RETAILER_ORDER':
      return {
        command: 'CREATE_RETAILER_ORDER',
        args: {
          retailerRef: args.retailerRef || args.retailer || args.customer || '',
          items: Array.isArray(args.items) ? args.items.map((item: any) => ({
            productRef: item.productRef || item.product || '',
            quantity: Number(item.quantity || 0),
          })) : [],
          note: args.note,
        }
      };

    case 'COMPLETE_BATCH':
      return {
        command: 'COMPLETE_BATCH',
        args: {
          batchRef: args.batchRef || args.batch || '',
          yieldQuantity: Number(args.yieldQuantity || args.yield || 0),
          lossQuantity: args.lossQuantity !== undefined ? Number(args.lossQuantity) : undefined,
          lossReason: args.lossReason,
        }
      };

    case 'CREATE_MATERIAL':
      return {
        command: 'CREATE_MATERIAL',
        args: {
          name: args.name || '',
          sku: args.sku,
          unit: args.unit,
          vendorRef: args.vendorRef || args.vendor,
          description: args.description,
        }
      };

    default:
      throw new Error(`Unknown command type: ${cmd}`);
  }
}

// ========================================
// MANUAL COMMAND ADDITION
// ========================================

/**
 * Add a command to an existing document import
 * Useful when AI parsing fails and user needs to manually add commands
 */
export async function addCommandToImport(
  importId: string,
  command: RawAICommandResult,
  userId?: string | null
): Promise<any> {
  const docImport = await getDocumentImport(importId);

  // Can't modify applied or rejected documents
  if (docImport.status === AIDocumentStatus.APPLIED || docImport.status === AIDocumentStatus.REJECTED) {
    throw new AppError(ErrorCodes.INVALID_STATUS, 'Cannot modify this document');
  }

  const aiResult = (docImport.aiResult as any) || { type: 'manual', commands: [] };
  aiResult.commands = aiResult.commands || [];
  aiResult.commands.push(command);

  const updated = await prisma.aIDocumentImport.update({
    where: { id: importId },
    data: {
      aiResult,
      status: AIDocumentStatus.PENDING_REVIEW,
    },
    include: {
      user: { select: { id: true, name: true } }
    }
  });

  await logAction({
    entityType: ActivityEntity.SYSTEM,
    entityId: importId,
    action: 'ai_document_command_added',
    userId: userId || undefined,
    summary: `Manual command added to document import: ${command.command}`,
    details: { command },
    tags: ['ai_ingest', 'document', 'manual'],
  });

  return updated;
}

/**
 * Remove a command from an existing document import
 */
export async function removeCommandFromImport(
  importId: string,
  commandIndex: number,
  userId?: string | null
): Promise<any> {
  const docImport = await getDocumentImport(importId);

  // Can't modify applied or rejected documents
  if (docImport.status === AIDocumentStatus.APPLIED || docImport.status === AIDocumentStatus.REJECTED) {
    throw new AppError(ErrorCodes.INVALID_STATUS, 'Cannot modify this document');
  }

  const aiResult = (docImport.aiResult as any) || { type: 'unknown', commands: [] };
  const commands = aiResult.commands || [];

  if (commandIndex < 0 || commandIndex >= commands.length) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid command index');
  }

  const removed = commands.splice(commandIndex, 1)[0];
  aiResult.commands = commands;

  const updated = await prisma.aIDocumentImport.update({
    where: { id: importId },
    data: {
      aiResult,
    },
    include: {
      user: { select: { id: true, name: true } }
    }
  });

  await logAction({
    entityType: ActivityEntity.SYSTEM,
    entityId: importId,
    action: 'ai_document_command_removed',
    userId: userId || undefined,
    summary: `Command removed from document import: ${removed?.command}`,
    details: { removedCommand: removed, commandIndex },
    tags: ['ai_ingest', 'document', 'manual'],
  });

  return updated;
}

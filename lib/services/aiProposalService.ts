/**
 * AI Proposal Service (Phase 1)
 * 
 * Manages the proposal-first workflow for AI-assisted operations.
 * 
 * GOVERNANCE RULES:
 * - Phase 1 allows ONLY: INVENTORY_ADJUSTMENT, PURCHASE_ORDER_SUBMIT, VENDOR_EMAIL
 * - All other actions are PREVIEW_ONLY (proposal can be created, but execution blocked)
 * - Proposals are single-use and time-limited
 * - All executions are logged to ActivityLog with ai_execution tag
 */

import { prisma } from '@/lib/db/prisma';
import { AIProposalStatus, ActivityEntity, PurchaseOrderStatus } from '@prisma/client';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { adjustInventory } from './inventoryService';
import { submitPurchaseOrder } from './purchaseOrderService';

// ========================================
// Configuration (env-configurable)
// ========================================

const AI_PROPOSAL_TTL_MINUTES = parseInt(process.env.AI_PROPOSAL_TTL_MINUTES || '15', 10);
const AI_MAX_PHASE = parseInt(process.env.AI_MAX_PHASE || '1', 10);

// ========================================
// Phase 1 Authority Constants
// ========================================

export const PHASE_1_ALLOWED_ACTIONS = [
  'INVENTORY_ADJUSTMENT',
  'PURCHASE_ORDER_SUBMIT',
  'VENDOR_EMAIL',
] as const;

export type Phase1Action = typeof PHASE_1_ALLOWED_ACTIONS[number];

export const ALL_PROPOSAL_ACTIONS = [
  'INVENTORY_ADJUSTMENT',
  'PURCHASE_ORDER_SUBMIT',
  'VENDOR_EMAIL',
  'PRODUCTION_ORDER',
  'RECEIVE_MATERIAL',
  'BATCH_COMPLETION',
  'ORDER_CREATION',
] as const;

export type ProposalAction = typeof ALL_PROPOSAL_ACTIONS[number];

// ========================================
// Types
// ========================================

export type ProposalWarning = {
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
};

export type InventoryAdjustmentParams = {
  inventoryId: string;
  delta: number;
  reason: string;
};

export type PurchaseOrderSubmitParams = {
  purchaseOrderId: string;
};

export type VendorEmailParams = {
  purchaseOrderId: string;
  recipientOverride?: string;
};

export type ProductionOrderParams = {
  productId: string;
  quantity: number;
  scheduledDate?: string;
};

export type ReceiveMaterialParams = {
  materialId: string;
  quantity: number;
  locationId?: string;
  lotNumber?: string;
  expiryDate?: string;
};

export type BatchCompletionParams = {
  batchId: string;
  actualQuantity: number;
  lossQuantity?: number;
  lossReason?: string;
};

export type OrderCreationParams = {
  retailerId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  requestedShipDate?: string;
  notes?: string;
};

export type ProposalParams =
  | InventoryAdjustmentParams
  | PurchaseOrderSubmitParams
  | VendorEmailParams
  | ProductionOrderParams
  | ReceiveMaterialParams
  | BatchCompletionParams
  | OrderCreationParams;

export type CreateProposalInput = {
  action: ProposalAction;
  params: ProposalParams;
  aiSessionId: string;
  userId: string;
  origin?: string;
};

export type ProposalPreview = {
  action: ProposalAction;
  description: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  details?: Record<string, unknown>;
};

export type AIError = {
  code: string;
  message: string;
  suggestion: string;
  speakable: string;
};

export type CreateProposalResult = {
  proposalId: string;
  action: ProposalAction;
  executionMode: 'EXECUTABLE' | 'PREVIEW_ONLY';
  phase: number;
  phase1Allowed: boolean;
  preview: ProposalPreview;
  warnings: ProposalWarning[];
  confirmationRequired: boolean;
  expiresAt: string;
};

export type ExecuteProposalResult = {
  success: true;
  entityId: string;
  entityType: string;
  message: string;
};

export type ExecuteProposalError = {
  success: false;
  error: AIError;
};

// ========================================
// Helper Functions
// ========================================

function isPhase1Allowed(action: string): action is Phase1Action {
  return PHASE_1_ALLOWED_ACTIONS.includes(action as Phase1Action);
}

function assertPhase1Authority(action: string): void {
  if (!isPhase1Allowed(action)) {
    throw new AppError(
      'PHASE_2_REQUIRED' as any,
      `${action} execution requires Phase 2 approval. This action is preview-only in Phase 1.`
    );
  }
}

function assertMaxPhase(requiredPhase: number): void {
  if (requiredPhase > AI_MAX_PHASE) {
    throw new AppError(
      'PHASE_LOCKED' as any,
      `Phase ${requiredPhase} is not enabled. Current max phase: ${AI_MAX_PHASE}`
    );
  }
}

// ========================================
// Proposal Creation
// ========================================

/**
 * Create a proposal for an AI-assisted action
 * 
 * This function:
 * 1. Validates the action type
 * 2. Computes a preview of what will happen
 * 3. Generates warnings (e.g., large delta for inventory)
 * 4. Stores the proposal in the database
 * 5. Returns the proposal with execution mode
 */
export async function createProposal(input: CreateProposalInput): Promise<CreateProposalResult> {
  const { action, params, aiSessionId, userId, origin } = input;

  // Validate action type
  if (!ALL_PROPOSAL_ACTIONS.includes(action)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, `Unknown action: ${action}`);
  }

  // Determine execution mode and phase
  const phase1Allowed = isPhase1Allowed(action);
  const executionMode = phase1Allowed ? 'EXECUTABLE' : 'PREVIEW_ONLY';
  const phase = 1; // Always Phase 1 for now

  // Generate preview and warnings based on action type
  const { preview, warnings } = await generatePreviewAndWarnings(action, params);

  // Calculate expiration
  const expiresAt = new Date(Date.now() + AI_PROPOSAL_TTL_MINUTES * 60 * 1000);

  // Store proposal
  const proposal = await prisma.aIProposal.create({
    data: {
      action,
      executionMode,
      phase,
      params: params as any,
      preview: preview as any,
      warnings: warnings.length > 0 ? (warnings as any) : undefined,
      status: AIProposalStatus.PENDING,
      phase1Allowed,
      aiSessionId,
      origin,
      createdByUserId: userId,
      expiresAt,
    },
  });

  return {
    proposalId: proposal.id,
    action,
    executionMode,
    phase,
    phase1Allowed,
    preview,
    warnings,
    confirmationRequired: true,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Generate preview and warnings for a proposal
 */
async function generatePreviewAndWarnings(
  action: ProposalAction,
  params: ProposalParams
): Promise<{ preview: ProposalPreview; warnings: ProposalWarning[] }> {
  const warnings: ProposalWarning[] = [];

  switch (action) {
    case 'INVENTORY_ADJUSTMENT': {
      const p = params as InventoryAdjustmentParams;
      const inventory = await prisma.inventoryItem.findUnique({
        where: { id: p.inventoryId },
        include: {
          material: { select: { name: true, sku: true } },
          product: { select: { name: true, sku: true } },
          location: { select: { name: true } },
        },
      });

      if (!inventory) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Inventory item not found');
      }

      const itemName = inventory.material?.name || inventory.product?.name || 'Unknown';
      const newQuantity = inventory.quantityOnHand + p.delta;

      // Check for large delta warning (>50% of current quantity)
      if (inventory.quantityOnHand > 0) {
        const percentChange = Math.abs(p.delta) / inventory.quantityOnHand;
        if (percentChange > 0.5) {
          warnings.push({
            type: 'LARGE_DELTA',
            message: `This adjustment changes quantity by ${Math.round(percentChange * 100)}% (from ${inventory.quantityOnHand} to ${newQuantity})`,
            severity: 'warning',
          });
        }
      }

      // Check for negative result
      if (newQuantity < 0) {
        warnings.push({
          type: 'NEGATIVE_RESULT',
          message: `This adjustment would result in negative inventory (${newQuantity})`,
          severity: 'error',
        });
      }

      return {
        preview: {
          action,
          description: `Adjust ${itemName} by ${p.delta > 0 ? '+' : ''}${p.delta} (${p.reason})`,
          before: {
            quantityOnHand: inventory.quantityOnHand,
            location: inventory.location.name,
          },
          after: {
            quantityOnHand: newQuantity,
            location: inventory.location.name,
          },
          details: {
            inventoryId: inventory.id,
            itemName,
            sku: inventory.material?.sku || inventory.product?.sku,
            delta: p.delta,
            reason: p.reason,
          },
        },
        warnings,
      };
    }

    case 'PURCHASE_ORDER_SUBMIT': {
      const p = params as PurchaseOrderSubmitParams;
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: p.purchaseOrderId },
        include: {
          vendor: { select: { name: true } },
          lineItems: {
            include: { material: { select: { name: true, sku: true } } },
          },
        },
      });

      if (!po) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Purchase order not found');
      }

      if (po.status !== PurchaseOrderStatus.DRAFT) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, `Cannot submit PO in ${po.status} status`);
      }

      const totalItems = po.lineItems.reduce((sum, li) => sum + li.quantityOrdered, 0);

      return {
        preview: {
          action,
          description: `Submit PO ${po.poNumber} to ${po.vendor.name}`,
          before: { status: po.status },
          after: { status: 'SENT' },
          details: {
            purchaseOrderId: po.id,
            poNumber: po.poNumber,
            vendorName: po.vendor.name,
            lineItemCount: po.lineItems.length,
            totalQuantity: totalItems,
          },
        },
        warnings,
      };
    }

    case 'VENDOR_EMAIL': {
      const p = params as VendorEmailParams;
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: p.purchaseOrderId },
        include: {
          vendor: { select: { name: true, contactEmail: true } },
        },
      });

      if (!po) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Purchase order not found');
      }

      const recipientEmail = p.recipientOverride || po.vendor.contactEmail;
      if (!recipientEmail) {
        warnings.push({
          type: 'NO_EMAIL',
          message: 'Vendor has no contact email configured',
          severity: 'error',
        });
      }

      return {
        preview: {
          action,
          description: `Send PO ${po.poNumber} email to ${po.vendor.name}`,
          details: {
            purchaseOrderId: po.id,
            poNumber: po.poNumber,
            vendorName: po.vendor.name,
            recipientEmail: recipientEmail || '(not configured)',
          },
        },
        warnings,
      };
    }

    case 'PRODUCTION_ORDER': {
      const p = params as ProductionOrderParams;
      const product = await prisma.product.findUnique({
        where: { id: p.productId },
        select: { name: true, sku: true },
      });

      if (!product) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
      }

      // Note: Full material requirements check would go here in Phase 2
      warnings.push({
        type: 'PHASE_2_ONLY',
        message: 'Production order creation is preview-only in Phase 1',
        severity: 'info',
      });

      return {
        preview: {
          action,
          description: `Create production order for ${p.quantity}x ${product.name}`,
          details: {
            productId: p.productId,
            productName: product.name,
            productSku: product.sku,
            quantity: p.quantity,
            scheduledDate: p.scheduledDate,
          },
        },
        warnings,
      };
    }

    case 'RECEIVE_MATERIAL': {
      const p = params as ReceiveMaterialParams;
      const material = await prisma.rawMaterial.findUnique({
        where: { id: p.materialId },
        select: { name: true, sku: true, currentStockQty: true },
      });

      if (!material) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Material not found');
      }

      warnings.push({
        type: 'PHASE_2_ONLY',
        message: 'Material receiving is preview-only in Phase 1',
        severity: 'info',
      });

      return {
        preview: {
          action,
          description: `Receive ${p.quantity} of ${material.name}`,
          before: { currentStockQty: material.currentStockQty },
          after: { currentStockQty: material.currentStockQty + p.quantity },
          details: {
            materialId: p.materialId,
            materialName: material.name,
            materialSku: material.sku,
            quantity: p.quantity,
            lotNumber: p.lotNumber,
            expiryDate: p.expiryDate,
          },
        },
        warnings,
      };
    }

    case 'BATCH_COMPLETION': {
      const p = params as BatchCompletionParams;
      const batch = await prisma.batch.findUnique({
        where: { id: p.batchId },
        include: {
          product: { select: { name: true, sku: true } },
        },
      });

      if (!batch) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Batch not found');
      }

      warnings.push({
        type: 'PHASE_2_ONLY',
        message: 'Batch completion is preview-only in Phase 1',
        severity: 'info',
      });

      return {
        preview: {
          action,
          description: `Complete batch ${batch.batchCode} with ${p.actualQuantity} units`,
          before: {
            status: batch.status,
            plannedQuantity: batch.plannedQuantity,
          },
          after: {
            status: 'RELEASED',
            actualQuantity: p.actualQuantity,
          },
          details: {
            batchId: batch.id,
            batchCode: batch.batchCode,
            productName: batch.product.name,
            productSku: batch.product.sku,
            actualQuantity: p.actualQuantity,
            lossQuantity: p.lossQuantity,
            lossReason: p.lossReason,
          },
        },
        warnings,
      };
    }

    case 'ORDER_CREATION': {
      const p = params as OrderCreationParams;
      const retailer = await prisma.retailer.findUnique({
        where: { id: p.retailerId },
        select: { name: true },
      });

      if (!retailer) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Retailer not found');
      }

      // Fetch product names for preview
      const productIds = p.items.map((item) => item.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const itemPreviews = p.items.map((item) => {
        const product = productMap.get(item.productId);
        return {
          productId: item.productId,
          productName: product?.name || 'Unknown',
          productSku: product?.sku,
          quantity: item.quantity,
        };
      });

      warnings.push({
        type: 'PHASE_2_ONLY',
        message: 'Order creation is preview-only in Phase 1',
        severity: 'info',
      });

      return {
        preview: {
          action,
          description: `Create order for ${retailer.name} with ${p.items.length} item(s)`,
          details: {
            retailerId: p.retailerId,
            retailerName: retailer.name,
            items: itemPreviews,
            requestedShipDate: p.requestedShipDate,
            notes: p.notes,
          },
        },
        warnings,
      };
    }

    default:
      return {
        preview: {
          action,
          description: `Unknown action: ${action}`,
        },
        warnings: [{ type: 'UNKNOWN_ACTION', message: 'Action not recognized', severity: 'error' }],
      };
  }
}

// ========================================
// Proposal Execution
// ========================================

/**
 * Execute a confirmed proposal
 * 
 * This function:
 * 1. Validates the proposal exists and is pending
 * 2. Checks expiration
 * 3. Enforces Phase 1 authority (blocks non-Phase-1 actions)
 * 4. Executes the action
 * 5. Updates proposal status
 * 6. Logs to ActivityLog with ai_execution tag
 */
export async function executeProposal(
  proposalId: string,
  executingUserId: string
): Promise<ExecuteProposalResult | ExecuteProposalError> {
  // Fetch proposal
  const proposal = await prisma.aIProposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal) {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Proposal not found',
        suggestion: 'The proposal may have expired or been deleted. Create a new proposal.',
        speakable: 'I could not find that proposal. It may have expired. Would you like to create a new one?',
      },
    };
  }

  // Check status
  if (proposal.status !== AIProposalStatus.PENDING) {
    return {
      success: false,
      error: {
        code: 'ALREADY_PROCESSED',
        message: `Proposal has already been ${proposal.status.toLowerCase()}`,
        suggestion: 'Create a new proposal if you want to perform this action again.',
        speakable: `This proposal was already ${proposal.status.toLowerCase()}. Would you like to create a new one?`,
      },
    };
  }

  // Check expiration
  if (proposal.expiresAt < new Date()) {
    await prisma.aIProposal.update({
      where: { id: proposalId },
      data: { status: AIProposalStatus.EXPIRED },
    });

    return {
      success: false,
      error: {
        code: 'EXPIRED',
        message: 'Proposal has expired',
        suggestion: 'Create a new proposal to perform this action.',
        speakable: 'This proposal has expired. Would you like me to create a new one?',
      },
    };
  }

  // Enforce Phase 1 authority
  if (!proposal.phase1Allowed) {
    await prisma.aIProposal.update({
      where: { id: proposalId },
      data: { status: AIProposalStatus.BLOCKED },
    });

    return {
      success: false,
      error: {
        code: 'PHASE_2_REQUIRED',
        message: `${proposal.action} execution requires Phase 2 approval.`,
        suggestion: 'You can preview this action, but execution must be done manually in the PsillyOps UI.',
        speakable: 'That action is available for preview, but execution is blocked until Phase 2 is approved.',
      },
    };
  }

  // Enforce max phase config
  if (proposal.phase > AI_MAX_PHASE) {
    await prisma.aIProposal.update({
      where: { id: proposalId },
      data: { status: AIProposalStatus.BLOCKED },
    });

    return {
      success: false,
      error: {
        code: 'PHASE_LOCKED',
        message: `Phase ${proposal.phase} is not enabled. Current max phase: ${AI_MAX_PHASE}`,
        suggestion: 'Contact an administrator to enable higher phase execution.',
        speakable: 'That phase of AI execution is not currently enabled.',
      },
    };
  }

  // Execute the action
  try {
    const result = await executeAction(proposal.action as ProposalAction, proposal.params as any, executingUserId);

    // Update proposal status
    await prisma.aIProposal.update({
      where: { id: proposalId },
      data: {
        status: AIProposalStatus.APPLIED,
        executedAt: new Date(),
        executedByUserId: executingUserId,
      },
    });

    // Log to ActivityLog
    await logAction({
      entityType: result.entityType as ActivityEntity,
      entityId: result.entityId,
      action: `AI_EXECUTE_${proposal.action}`,
      userId: executingUserId,
      summary: result.message,
      metadata: {
        proposalId,
        aiSessionId: proposal.aiSessionId,
        action: proposal.action,
        params: proposal.params,
      },
      tags: ['ai_execution', 'ai_governance'],
    });

    return {
      success: true,
      entityId: result.entityId,
      entityType: result.entityType,
      message: result.message,
    };
  } catch (error) {
    // Update proposal status to failed
    await prisma.aIProposal.update({
      where: { id: proposalId },
      data: { status: AIProposalStatus.FAILED },
    });

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      error: {
        code: 'EXECUTION_FAILED',
        message: errorMessage,
        suggestion: 'Review the error and try again, or perform this action manually.',
        speakable: `The action failed: ${errorMessage}. Would you like me to try again?`,
      },
    };
  }
}

/**
 * Execute a specific action type
 */
async function executeAction(
  action: ProposalAction,
  params: ProposalParams,
  userId: string
): Promise<{ entityId: string; entityType: string; message: string }> {
  switch (action) {
    case 'INVENTORY_ADJUSTMENT': {
      const p = params as InventoryAdjustmentParams;
      
      // Get inventory item for logging
      const inventory = await prisma.inventoryItem.findUnique({
        where: { id: p.inventoryId },
        include: {
          material: { select: { name: true } },
          product: { select: { name: true } },
        },
      });

      if (!inventory) {
        throw new Error('Inventory item not found');
      }

      const itemName = inventory.material?.name || inventory.product?.name || 'Unknown';

      // Perform adjustment
      await adjustInventory({
        inventoryId: p.inventoryId,
        deltaQuantity: p.delta,
        reason: p.reason,
        userId,
      });

      return {
        entityId: p.inventoryId,
        entityType: 'INVENTORY',
        message: `Adjusted ${itemName} by ${p.delta > 0 ? '+' : ''}${p.delta} (${p.reason})`,
      };
    }

    case 'PURCHASE_ORDER_SUBMIT': {
      const p = params as PurchaseOrderSubmitParams;
      
      // Submit PO
      await submitPurchaseOrder(p.purchaseOrderId, userId);

      // Get PO details for message
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: p.purchaseOrderId },
        include: { vendor: { select: { name: true } } },
      });

      return {
        entityId: p.purchaseOrderId,
        entityType: 'PURCHASE_ORDER',
        message: `Submitted PO ${po?.poNumber || p.purchaseOrderId} to ${po?.vendor.name || 'vendor'}`,
      };
    }

    case 'VENDOR_EMAIL': {
      const p = params as VendorEmailParams;
      
      // Get PO details
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: p.purchaseOrderId },
        include: { vendor: { select: { name: true, contactEmail: true } } },
      });

      if (!po) {
        throw new Error('Purchase order not found');
      }

      const recipientEmail = p.recipientOverride || po.vendor.contactEmail;

      // TODO: Implement actual email sending when email service is configured
      // For now, return success with emailSent: false
      
      return {
        entityId: p.purchaseOrderId,
        entityType: 'PURCHASE_ORDER',
        message: `Email for PO ${po.poNumber} to ${po.vendor.name} - emailSent: false, reason: EMAIL_NOT_CONFIGURED`,
      };
    }

    default:
      // This should never be reached - Phase 2 actions are blocked in executeProposal()
      // before reaching this function. This is a safety net.
      throw new Error(
        `Action ${action} has no execution handler. ` +
        `This is a Phase 2+ action that should have been blocked earlier.`
      );
  }
}

// ========================================
// Query Functions
// ========================================

/**
 * Get a proposal by ID
 */
export async function getProposal(proposalId: string) {
  return prisma.aIProposal.findUnique({
    where: { id: proposalId },
    include: {
      createdByUser: { select: { id: true, name: true } },
      executedByUser: { select: { id: true, name: true } },
    },
  });
}

/**
 * List proposals for a session
 */
export async function listProposals(aiSessionId: string, limit = 50) {
  return prisma.aIProposal.findMany({
    where: { aiSessionId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      createdByUser: { select: { id: true, name: true } },
    },
  });
}

/**
 * Get recent command logs (for /api/ai/command-log)
 */
export async function getRecentCommandLogs(options: {
  limit?: number;
  status?: string;
  userId?: string;
}) {
  const { limit = 50, status, userId } = options;

  const where: any = {};
  if (status) where.status = status;
  if (userId) where.userId = userId;

  const logs = await prisma.aICommandLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  return {
    logs: logs.map((log) => ({
      id: log.id,
      inputText: log.inputText,
      normalized: log.normalized,
      status: log.status,
      createdAt: log.createdAt.toISOString(),
      appliedAt: log.appliedAt?.toISOString(),
      user: log.user ? { id: log.user.id, name: log.user.name } : null,
    })),
    total: logs.length,
  };
}


/**
 * AI Context Service (Phase 1)
 * 
 * Provides system state summaries for AI context injection and manages AI sessions.
 * 
 * GOVERNANCE RULES:
 * - Context must be summary-only (no raw entity lists, PII, full objects)
 * - No vendor contact details, pricing breakdowns, or auth metadata
 * - Sessions are server-generated and required for propose/execute calls
 */

import { prisma } from '@/lib/db/prisma';
import { PurchaseOrderStatus, ProductionRunStatus, OrderStatus, ProductionStepStatus, BatchStatus } from '@prisma/client';
import { getLowStockMaterials } from './inventoryService';
import { randomBytes } from 'crypto';

// Base62 alphabet for token generation
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function generateSessionToken(): string {
  const bytes = randomBytes(24);
  let token = 'ais_';
  for (let i = 0; i < 24; i++) {
    token += BASE62[bytes[i] % 62];
  }
  return token;
}

// ========================================
// Configuration (env-configurable)
// ========================================

const AI_SESSION_TTL_HOURS = parseInt(process.env.AI_SESSION_TTL_HOURS || '24', 10);
const AI_CONTEXT_STALE_SECONDS = parseInt(process.env.AI_CONTEXT_STALE_SECONDS || '60', 10);

// ========================================
// Types
// ========================================

export type AttentionSeverity = 'info' | 'warning' | 'error';

export type AttentionItem = {
  type: string;
  entity: string;
  entityId: string;
  severity: AttentionSeverity;
  message?: string;
};

export type AIContextSummary = {
  pendingOrders: number;
  lowStockMaterials: number;
  activeProductionRuns: number;
  stalledProductionRuns: number;
  openPurchaseOrders: number;
  draftPurchaseOrders: number;
  attentionItems: AttentionItem[];
};

export type AIContextResponse = {
  timestamp: string;
  staleAfter: string;
  aiSessionId: string;
  summary: AIContextSummary;
  recentActivity: Array<{
    id: string;
    action: string;
    summary: string;
    createdAt: string;
  }>;
};

// ========================================
// Session Management
// ========================================

/**
 * Create a new AI session for a user
 * Sessions are server-generated and returned to the client
 */
export async function createAISession(userId: string, origin?: string): Promise<{
  sessionToken: string;
  expiresAt: Date;
}> {
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + AI_SESSION_TTL_HOURS * 60 * 60 * 1000);

  await prisma.aISession.create({
    data: {
      sessionToken,
      userId,
      origin: origin || 'unknown',
      expiresAt,
    },
  });

  return { sessionToken, expiresAt };
}

/**
 * Validate and refresh an AI session
 * Returns the session if valid, null if expired or invalid
 */
export async function validateAISession(sessionToken: string): Promise<{
  id: string;
  userId: string;
  origin: string | null;
} | null> {
  const session = await prisma.aISession.findUnique({
    where: { sessionToken },
    select: { id: true, userId: true, origin: true, expiresAt: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) return null;

  // Update last activity
  await prisma.aISession.update({
    where: { sessionToken },
    data: { lastActivityAt: new Date() },
  });

  return { id: session.id, userId: session.userId, origin: session.origin };
}

/**
 * Get or create an AI session for context requests
 * If a valid session token is provided, validates it
 * Otherwise creates a new session
 */
export async function getOrCreateAISession(
  userId: string,
  existingToken?: string,
  origin?: string
): Promise<{ sessionToken: string; expiresAt: Date; isNew: boolean }> {
  if (existingToken) {
    const session = await prisma.aISession.findUnique({
      where: { sessionToken: existingToken },
      select: { sessionToken: true, expiresAt: true },
    });

    if (session && session.expiresAt > new Date()) {
      // Refresh activity
      await prisma.aISession.update({
        where: { sessionToken: existingToken },
        data: { lastActivityAt: new Date() },
      });
      return { sessionToken: session.sessionToken, expiresAt: session.expiresAt, isNew: false };
    }
  }

  // Create new session
  const newSession = await createAISession(userId, origin);
  return { ...newSession, isNew: true };
}

// ========================================
// Context Generation
// ========================================

/**
 * Get AI context summary
 * This is the primary entry point for AI assistants to understand system state
 * 
 * RULES:
 * - Summary-only, no raw entity lists
 * - No PII, vendor contact details, or pricing
 * - Include staleAfter timestamp for AI refresh decisions
 */
export async function getAIContext(userId: string, sessionToken: string): Promise<AIContextResponse> {
  const now = new Date();
  const staleAfter = new Date(now.getTime() + AI_CONTEXT_STALE_SECONDS * 1000);

  // Gather all context data in parallel
  const [
    pendingOrdersCount,
    lowStockResult,
    activeRunsCount,
    stalledRunsCount,
    openPOsCount,
    draftPOsCount,
    attentionItems,
    recentActivity,
  ] = await Promise.all([
    // Pending orders (SUBMITTED, waiting for approval)
    prisma.retailerOrder.count({
      where: { status: OrderStatus.SUBMITTED },
    }),

    // Low stock materials
    getLowStockMaterials(),

    // Active production runs
    prisma.productionRun.count({
      where: { status: ProductionRunStatus.IN_PROGRESS },
    }),

    // Stalled production runs (IN_PROGRESS with steps stalled > 4 hours)
    getStalledProductionRunsCount(),

    // Open purchase orders (SENT or PARTIALLY_RECEIVED)
    prisma.purchaseOrder.count({
      where: { status: { in: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED] } },
    }),

    // Draft purchase orders
    prisma.purchaseOrder.count({
      where: { status: PurchaseOrderStatus.DRAFT },
    }),

    // Attention items
    getAttentionItems(),

    // Recent activity (last 5 entries, no sensitive data)
    prisma.activityLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        summary: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    timestamp: now.toISOString(),
    staleAfter: staleAfter.toISOString(),
    aiSessionId: sessionToken,
    summary: {
      pendingOrders: pendingOrdersCount,
      lowStockMaterials: lowStockResult.materials.length,
      activeProductionRuns: activeRunsCount,
      stalledProductionRuns: stalledRunsCount,
      openPurchaseOrders: openPOsCount,
      draftPurchaseOrders: draftPOsCount,
      attentionItems,
    },
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      action: a.action,
      summary: a.summary,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

/**
 * Count production runs with stalled steps (IN_PROGRESS > 4 hours)
 */
async function getStalledProductionRunsCount(): Promise<number> {
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

  const stalledRuns = await prisma.productionRun.findMany({
    where: {
      status: ProductionRunStatus.IN_PROGRESS,
      steps: {
        some: {
          status: ProductionStepStatus.IN_PROGRESS,
          startedAt: { lt: fourHoursAgo },
        },
      },
    },
    select: { id: true },
  });

  return stalledRuns.length;
}

/**
 * Get attention items that need human review
 * Returns summary-level items only (no full entities)
 */
async function getAttentionItems(): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

  // 1. Low stock materials (top 5)
  const lowStock = await getLowStockMaterials();
  for (const material of lowStock.materials.slice(0, 5)) {
    items.push({
      type: 'LOW_STOCK',
      entity: material.name,
      entityId: material.id,
      severity: material.currentStockQty === 0 ? 'error' : 'warning',
      message: `${material.currentStockQty} ${material.unitOfMeasure} (reorder at ${material.reorderPoint})`,
    });
  }

  // 2. Stalled production runs (steps in progress > 4 hours)
  const stalledRuns = await prisma.productionRun.findMany({
    where: {
      status: ProductionRunStatus.IN_PROGRESS,
      steps: {
        some: {
          status: ProductionStepStatus.IN_PROGRESS,
          startedAt: { lt: fourHoursAgo },
        },
      },
    },
    select: {
      id: true,
      product: { select: { name: true } },
      steps: {
        where: {
          status: ProductionStepStatus.IN_PROGRESS,
          startedAt: { lt: fourHoursAgo },
        },
        select: { label: true, startedAt: true },
        take: 1,
      },
    },
    take: 5,
  });

  for (const run of stalledRuns) {
    const stalledStep = run.steps[0];
    if (stalledStep) {
      const hoursStalled = Math.floor((Date.now() - stalledStep.startedAt!.getTime()) / (1000 * 60 * 60));
      items.push({
        type: 'STALLED_RUN',
        entity: run.product.name,
        entityId: run.id,
        severity: 'error',
        message: `"${stalledStep.label}" stalled for ${hoursStalled}h`,
      });
    }
  }

  // 3. Draft purchase orders (awaiting submission)
  const draftPOs = await prisma.purchaseOrder.findMany({
    where: { status: PurchaseOrderStatus.DRAFT },
    select: {
      id: true,
      poNumber: true,
      vendor: { select: { name: true } },
    },
    take: 3,
  });

  for (const po of draftPOs) {
    items.push({
      type: 'DRAFT_PO',
      entity: `${po.poNumber} (${po.vendor.name})`,
      entityId: po.id,
      severity: 'info',
      message: 'Awaiting submission',
    });
  }

  // 4. Batches on QC hold
  const qcHoldBatches = await prisma.batch.findMany({
    where: { status: BatchStatus.QC_HOLD },
    select: {
      id: true,
      batchCode: true,
      product: { select: { name: true } },
    },
    take: 3,
  });

  for (const batch of qcHoldBatches) {
    items.push({
      type: 'QC_HOLD',
      entity: `${batch.product.name} (${batch.batchCode})`,
      entityId: batch.id,
      severity: 'warning',
      message: 'Awaiting QC decision',
    });
  }

  // 5. Expiring inventory (within 30 days)
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiringInventory = await prisma.inventoryItem.findMany({
    where: {
      expiryDate: { lte: thirtyDaysFromNow, gt: new Date() },
      quantityOnHand: { gt: 0 },
    },
    select: {
      id: true,
      expiryDate: true,
      material: { select: { name: true } },
      product: { select: { name: true } },
    },
    take: 3,
  });

  for (const inv of expiringInventory) {
    const itemName = inv.material?.name || inv.product?.name || 'Unknown';
    const daysUntilExpiry = Math.ceil((inv.expiryDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    items.push({
      type: 'EXPIRING_SOON',
      entity: itemName,
      entityId: inv.id,
      severity: daysUntilExpiry <= 7 ? 'error' : 'warning',
      message: `Expires in ${daysUntilExpiry} days`,
    });
  }

  return items;
}


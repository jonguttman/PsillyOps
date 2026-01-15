/**
 * Binding Session Service
 * 
 * Manages time-bounded batch binding sessions for mobile seal assignment.
 * 
 * PHASE 2C INVARIANTS:
 * ====================
 * 1. Only ONE active BindingSession per Partner at any time
 * 2. Default session duration: 5 minutes
 * 3. Sessions auto-expire when expiresAt is reached
 * 4. Starting a new session auto-terminates any existing ACTIVE session
 * 5. Manual bindings (Phase 2B) have bindingSessionId = null
 * 6. Rebinding is allowed but never automatic
 */

import { prisma } from '@/lib/db/prisma';
import { SessionStatus } from '@prisma/client';
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { ActivityEntity } from '@prisma/client';

// Default session duration in minutes
const DEFAULT_SESSION_DURATION_MINUTES = 5;

export interface StartSessionParams {
  partnerId: string;
  partnerProductId: string;
  userId: string;
  durationMinutes?: number;
}

export interface SessionWithProduct {
  id: string;
  partnerId: string;
  partnerProductId: string;
  startedById: string;
  startedAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
  status: SessionStatus;
  scanCount: number;
  partnerProduct: {
    id: string;
    name: string;
    sku: string | null;
  };
}

/**
 * Start a new binding session
 * 
 * Automatically terminates any existing ACTIVE session for the partner.
 * Returns the newly created session.
 */
export async function startSession(params: StartSessionParams): Promise<SessionWithProduct> {
  const { partnerId, partnerProductId, userId, durationMinutes = DEFAULT_SESSION_DURATION_MINUTES } = params;

  // Verify partner exists and is not suspended
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Partner not found');
  }

  if (partner.status === 'SUSPENDED') {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Partner is suspended. Cannot start binding session.');
  }

  // Verify product exists and belongs to partner
  const product = await prisma.partnerProduct.findUnique({
    where: { id: partnerProductId },
  });

  if (!product) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Partner product not found');
  }

  if (product.partnerId !== partnerId) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Product does not belong to this partner');
  }

  // Auto-terminate any existing ACTIVE session for this partner
  const existingSession = await prisma.bindingSession.findFirst({
    where: {
      partnerId,
      status: 'ACTIVE',
    },
  });

  if (existingSession) {
    await prisma.bindingSession.update({
      where: { id: existingSession.id },
      data: {
        status: 'TERMINATED',
        endedAt: new Date(),
      },
    });

    await logAction({
      entityType: ActivityEntity.LABEL,
      entityId: existingSession.id,
      action: 'binding_session_auto_terminated',
      userId,
      summary: `Session auto-terminated due to new session start`,
      metadata: {
        sessionId: existingSession.id,
        partnerId,
        scanCount: existingSession.scanCount,
        reason: 'new_session_started',
        logCategory: 'certification',
      },
      tags: ['session', 'terminated', 'auto', 'certification'],
    });
  }

  // Calculate expiration time
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

  // Create new session
  const session = await prisma.bindingSession.create({
    data: {
      partnerId,
      partnerProductId,
      startedById: userId,
      startedAt,
      expiresAt,
      status: 'ACTIVE',
      scanCount: 0,
    },
    include: {
      partnerProduct: {
        select: {
          id: true,
          name: true,
          sku: true,
        },
      },
    },
  });

  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: session.id,
    action: 'binding_session_started',
    userId,
    summary: `Binding session started for product: ${product.name}`,
    metadata: {
      sessionId: session.id,
      partnerId,
      partnerProductId,
      productName: product.name,
      durationMinutes,
      expiresAt: expiresAt.toISOString(),
      logCategory: 'certification',
    },
    tags: ['session', 'started', 'certification'],
  });

  return session;
}

/**
 * End a binding session manually
 */
export async function endSession(sessionId: string, userId: string): Promise<SessionWithProduct> {
  const session = await prisma.bindingSession.findUnique({
    where: { id: sessionId },
    include: {
      partnerProduct: {
        select: {
          id: true,
          name: true,
          sku: true,
        },
      },
    },
  });

  if (!session) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Session not found');
  }

  if (session.status !== 'ACTIVE') {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Session is not active');
  }

  const endedAt = new Date();
  const durationMs = endedAt.getTime() - session.startedAt.getTime();
  const durationSeconds = Math.floor(durationMs / 1000);

  const updatedSession = await prisma.bindingSession.update({
    where: { id: sessionId },
    data: {
      status: 'TERMINATED',
      endedAt,
    },
    include: {
      partnerProduct: {
        select: {
          id: true,
          name: true,
          sku: true,
        },
      },
    },
  });

  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: sessionId,
    action: 'binding_session_ended',
    userId,
    summary: `Binding session ended. ${session.scanCount} seals bound.`,
    metadata: {
      sessionId,
      partnerId: session.partnerId,
      partnerProductId: session.partnerProductId,
      productName: session.partnerProduct.name,
      scanCount: session.scanCount,
      durationSeconds,
      logCategory: 'certification',
    },
    tags: ['session', 'ended', 'certification'],
  });

  return updatedSession;
}

/**
 * Get the active session for a partner
 * 
 * Also checks if the session has expired and marks it accordingly.
 */
export async function getActiveSession(partnerId: string): Promise<SessionWithProduct | null> {
  const session = await prisma.bindingSession.findFirst({
    where: {
      partnerId,
      status: 'ACTIVE',
    },
    include: {
      partnerProduct: {
        select: {
          id: true,
          name: true,
          sku: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  // Check if session has expired
  if (session.expiresAt < new Date()) {
    // Mark as expired
    const expiredSession = await prisma.bindingSession.update({
      where: { id: session.id },
      data: {
        status: 'EXPIRED',
        endedAt: session.expiresAt,
      },
      include: {
        partnerProduct: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
      },
    });

    await logAction({
      entityType: ActivityEntity.LABEL,
      entityId: session.id,
      action: 'binding_session_expired',
      summary: `Binding session expired. ${session.scanCount} seals bound.`,
      metadata: {
        sessionId: session.id,
        partnerId: session.partnerId,
        partnerProductId: session.partnerProductId,
        productName: session.partnerProduct.name,
        scanCount: session.scanCount,
        logCategory: 'certification',
      },
      tags: ['session', 'expired', 'certification'],
    });

    return null; // Session has expired
  }

  return session;
}

/**
 * Get session by ID (regardless of status)
 */
export async function getSessionById(sessionId: string): Promise<SessionWithProduct | null> {
  return prisma.bindingSession.findUnique({
    where: { id: sessionId },
    include: {
      partnerProduct: {
        select: {
          id: true,
          name: true,
          sku: true,
        },
      },
    },
  });
}

/**
 * Increment scan count for a session
 */
export async function incrementScanCount(sessionId: string): Promise<void> {
  await prisma.bindingSession.update({
    where: { id: sessionId },
    data: {
      scanCount: {
        increment: 1,
      },
    },
  });
}

/**
 * Expire all sessions that have passed their expiresAt time
 * 
 * This is meant to be called by a cron job or scheduled task.
 */
export async function expireSessions(): Promise<number> {
  const now = new Date();

  const result = await prisma.bindingSession.updateMany({
    where: {
      status: 'ACTIVE',
      expiresAt: {
        lt: now,
      },
    },
    data: {
      status: 'EXPIRED',
      endedAt: now,
    },
  });

  if (result.count > 0) {
    await logAction({
      entityType: ActivityEntity.LABEL,
      action: 'binding_sessions_bulk_expired',
      summary: `${result.count} binding sessions expired by scheduled task`,
      metadata: {
        count: result.count,
        expiredAt: now.toISOString(),
        logCategory: 'certification',
      },
      tags: ['session', 'expired', 'bulk', 'certification'],
    });
  }

  return result.count;
}

/**
 * Get recent bindings for a session (for "last 5 scans" display)
 */
export async function getRecentSessionBindings(sessionId: string, limit: number = 5) {
  return prisma.experienceBinding.findMany({
    where: {
      bindingSessionId: sessionId,
    },
    orderBy: {
      boundAt: 'desc',
    },
    take: limit,
    include: {
      sealToken: {
        select: {
          token: true,
        },
      },
    },
  });
}


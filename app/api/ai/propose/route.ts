/**
 * API Route: POST /api/ai/propose
 * 
 * Creates a proposal for an AI-assisted action.
 * Proposals are previews that require explicit confirmation before execution.
 * 
 * GOVERNANCE:
 * - All proposals are stored in database for audit
 * - Phase 1 allows only: INVENTORY_ADJUSTMENT, PURCHASE_ORDER_SUBMIT, VENDOR_EMAIL
 * - Other actions return executionMode: PREVIEW_ONLY
 * - Proposals expire after AI_PROPOSAL_TTL_MINUTES (default 15)
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { validateAISession } from '@/lib/services/aiContextService';
import { createProposal, ALL_PROPOSAL_ACTIONS, type ProposalAction } from '@/lib/services/aiProposalService';

export async function POST(req: NextRequest) {
  try {
    // 1. Validate authentication
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // 2. Check AI permission
    if (!hasPermission(session.user.role, 'ai', 'command')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions for AI operations' },
        { status: 403 }
      );
    }

    // 3. Validate AI session
    const aiSessionId = req.headers.get('X-AI-Session-ID');
    if (!aiSessionId) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'SESSION_REQUIRED',
            message: 'X-AI-Session-ID header is required',
            suggestion: 'Call GET /api/ai/context first to obtain a session token',
            speakable: 'I need to initialize a session first. Let me get the current context.',
          },
        },
        { status: 400 }
      );
    }

    const aiSession = await validateAISession(aiSessionId);
    if (!aiSession) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'SESSION_INVALID',
            message: 'AI session is invalid or expired',
            suggestion: 'Call GET /api/ai/context to obtain a new session token',
            speakable: 'Your session has expired. Let me refresh the context.',
          },
        },
        { status: 401 }
      );
    }

    // 4. Parse and validate request body
    const body = await req.json();
    const { action, params } = body;

    if (!action || !params) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'action and params are required');
    }

    if (!ALL_PROPOSAL_ACTIONS.includes(action as ProposalAction)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Unknown action: ${action}`);
    }

    // 5. Create proposal
    const origin = req.headers.get('X-AI-Origin') || aiSession.origin || 'unknown';
    
    const result = await createProposal({
      action: action as ProposalAction,
      params,
      aiSessionId,
      userId: session.user.id,
      origin,
    });

    // 6. Return proposal
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}


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
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { validateAISession, getOrCreateAISession } from '@/lib/services/aiContextService';
import { createProposal, ALL_PROPOSAL_ACTIONS, type ProposalAction } from '@/lib/services/aiProposalService';
import { authenticateAIRequest } from '@/lib/auth/aiAuth';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate (API key or session)
    const aiAuth = await authenticateAIRequest(req);
    
    if (!aiAuth.authenticated || !aiAuth.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // 2. Check AI permission
    if (!hasPermission(aiAuth.user.role, 'ai', 'command')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions for AI operations' },
        { status: 403 }
      );
    }

    // 3. Get or create AI session (auto-create if not provided)
    const headerSessionId = req.headers.get('X-AI-Session-ID');
    let aiSession = headerSessionId ? await validateAISession(headerSessionId) : null;
    let sessionId: string;
    
    // If no valid session, auto-create one for convenience
    if (!aiSession) {
      const sessionOrigin = req.headers.get('X-AI-Origin') || 'chatgpt';
      const newSession = await getOrCreateAISession(aiAuth.user.id, undefined, sessionOrigin);
      sessionId = newSession.sessionToken;
    } else {
      sessionId = headerSessionId!;
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
    const origin = req.headers.get('X-AI-Origin') || 'chatgpt';
    
    const result = await createProposal({
      action: action as ProposalAction,
      params,
      aiSessionId: sessionId,
      userId: aiAuth.user.id,
      origin,
    });

    // 6. Return proposal
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}


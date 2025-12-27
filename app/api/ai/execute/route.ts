/**
 * API Route: POST /api/ai/execute
 * 
 * Executes a previously created proposal.
 * 
 * GOVERNANCE:
 * - Phase 1 allows ONLY: INVENTORY_ADJUSTMENT, PURCHASE_ORDER_SUBMIT, VENDOR_EMAIL
 * - Other actions return PHASE_2_REQUIRED error
 * - Proposals are single-use and time-limited
 * - All executions logged to ActivityLog with ai_execution tag
 * - AI_MAX_PHASE env var provides kill switch
 */

import { NextRequest } from 'next/server';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { validateAISession } from '@/lib/services/aiContextService';
import { executeProposal, getProposal } from '@/lib/services/aiProposalService';
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

    const aiSession = await validateAISession(aiSessionId, aiAuth.user.id);
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

    // 4. Parse request body
    const body = await req.json();
    const { proposalId } = body;

    if (!proposalId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'proposalId is required');
    }

    // 5. Verify proposal belongs to this session
    const proposal = await getProposal(proposalId);
    if (!proposal) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Proposal not found',
            suggestion: 'The proposal may have expired or been deleted. Create a new proposal.',
            speakable: 'I could not find that proposal. It may have expired. Would you like to create a new one?',
          },
        },
        { status: 404 }
      );
    }

    if (proposal.aiSessionId !== aiSessionId) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'SESSION_MISMATCH',
            message: 'Proposal belongs to a different session',
            suggestion: 'Create a new proposal in the current session.',
            speakable: 'That proposal was created in a different session. Would you like me to create a new one?',
          },
        },
        { status: 403 }
      );
    }

    // 6. Execute proposal
    const result = await executeProposal(proposalId, aiAuth.user.id);

    // 7. Return result
    if (result.success) {
      return Response.json(result);
    } else {
      // Determine appropriate status code based on error
      let status = 400;
      if (result.error.code === 'NOT_FOUND') status = 404;
      if (result.error.code === 'PHASE_2_REQUIRED') status = 403;
      if (result.error.code === 'PHASE_LOCKED') status = 403;
      if (result.error.code === 'EXPIRED') status = 410;
      if (result.error.code === 'ALREADY_PROCESSED') status = 409;

      return Response.json(result, { status });
    }
  } catch (error) {
    return handleApiError(error);
  }
}


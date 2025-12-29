/**
 * API Route: POST /api/ai/propose
 * 
 * STEP 2 of the AI order creation flow.
 * 
 * Creates a proposal for an AI-assisted action.
 * Proposals are previews that require explicit confirmation before execution.
 * 
 * USAGE:
 * 1. First call /api/ai/validate-order to resolve entity references
 * 2. Pass proposalParams from validation response to this endpoint
 * 3. The backend does NOT re-resolve references during proposal creation
 * 
 * ACCEPTED FORMATS:
 * - Direct params: { action, params } - for pre-resolved data
 * - From validation: { action, validatedOrder } - converted internally
 * 
 * GOVERNANCE:
 * - All proposals are stored in database for audit
 * - Phase 1 allows only: INVENTORY_ADJUSTMENT, PURCHASE_ORDER_SUBMIT, VENDOR_EMAIL,
 *                        ORDER_CREATION, PURCHASE_ORDER_CREATION
 * - Other actions return executionMode: PREVIEW_ONLY
 * - Proposals expire after AI_PROPOSAL_TTL_MINUTES (default 15)
 */

import { NextRequest } from 'next/server';
import { handleApiError, AppError, ErrorCodes } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { validateAISession, getOrCreateAISession } from '@/lib/services/aiContextService';
import { 
  createProposal, 
  ALL_PROPOSAL_ACTIONS, 
  type ProposalAction,
  type OrderCreationParams,
  type PurchaseOrderCreationParams,
  normalizeValidatedSalesOrder,
  normalizeValidatedPurchaseOrder,
  type ValidatedSalesOrder,
  type ValidatedPurchaseOrder,
} from '@/lib/services/aiProposalService';
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

    // 4. Parse request body and normalize input
    const body = await req.json();
    const { action, params, validatedOrder } = body;

    if (!action) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR, 
        'action is required'
      );
    }

    if (!ALL_PROPOSAL_ACTIONS.includes(action as ProposalAction)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Unknown action: ${action}`);
    }

    // 5. Normalize input - accept either params or validatedOrder
    let normalizedParams: OrderCreationParams | PurchaseOrderCreationParams | typeof params;
    let inputSource: 'params' | 'validatedOrder';

    if (params) {
      // Direct params format (backward compatible)
      normalizedParams = params;
      inputSource = 'params';
    } else if (validatedOrder) {
      // Validated order format from /api/ai/validate-order
      if (action === 'ORDER_CREATION') {
        normalizedParams = normalizeValidatedSalesOrder(validatedOrder as ValidatedSalesOrder);
        inputSource = 'validatedOrder';
      } else if (action === 'PURCHASE_ORDER_CREATION') {
        normalizedParams = normalizeValidatedPurchaseOrder(validatedOrder as ValidatedPurchaseOrder);
        inputSource = 'validatedOrder';
      } else {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          `validatedOrder format is only supported for ORDER_CREATION and PURCHASE_ORDER_CREATION actions`
        );
      }
    } else {
      // Neither params nor validatedOrder provided
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Proposal creation requires resolved order data. ' +
        'Call /api/ai/validate-order first and pass proposalParams, or provide resolved params.'
      );
    }

    // Log normalization source for observability
    console.log('[AI Propose] Normalizing proposal input', {
      source: inputSource,
      action,
      userId: aiAuth.user.id,
    });

    // 6. Create proposal
    const origin = req.headers.get('X-AI-Origin') || 'chatgpt';
    
    const result = await createProposal({
      action: action as ProposalAction,
      params: normalizedParams,
      aiSessionId: sessionId,
      userId: aiAuth.user.id,
      origin,
    });

    // 7. Return proposal
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

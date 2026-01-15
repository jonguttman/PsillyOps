/**
 * API Route: GET /api/ai/context
 * 
 * Returns system state summary for AI context injection.
 * Creates or validates AI session and returns session token.
 * 
 * GOVERNANCE:
 * - Summary-only data (no raw entity lists, PII, or full objects)
 * - Session token required for subsequent propose/execute calls
 * - Includes staleAfter timestamp for AI refresh decisions
 */

import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { getAIContext, getOrCreateAISession } from '@/lib/services/aiContextService';
import { authenticateAIRequest } from '@/lib/auth/aiAuth';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate (API key or session)
    const aiAuth = await authenticateAIRequest(req);
    
    if (!aiAuth.authenticated || !aiAuth.user) {
      return Response.json(
        { 
          code: 'UNAUTHORIZED', 
          message: 'Authentication required. Provide Authorization: Bearer <token> header or valid session cookie.',
          hint: 'Set AI_API_KEY and AI_API_USER_ID in environment, then use that key in Authorization header.'
        },
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

    // 3. Get or create AI session
    const existingToken = req.headers.get('X-AI-Session-ID') || undefined;
    const origin = req.headers.get('X-AI-Origin') || 'chatgpt';
    
    const { sessionToken, expiresAt, isNew } = await getOrCreateAISession(
      aiAuth.user.id,
      existingToken,
      origin
    );

    // 4. Get context
    const context = await getAIContext(aiAuth.user.id, sessionToken);

    // 5. Return response with session info
    return Response.json({
      ...context,
      session: {
        token: sessionToken,
        expiresAt: expiresAt.toISOString(),
        isNew,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}


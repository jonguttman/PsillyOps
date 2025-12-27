/**
 * API Route: GET /api/ai/command-log
 * 
 * Returns recent AI command history for debugging and audit.
 * 
 * Query Params:
 * - limit (optional, default 50)
 * - status (optional): PENDING, APPLIED, FAILED, BLOCKED
 */

import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { getRecentCommandLogs } from '@/lib/services/aiProposalService';
import { authenticateAIRequest } from '@/lib/auth/aiAuth';

export async function GET(req: NextRequest) {
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

    // 3. Parse query params
    const searchParams = req.nextUrl.searchParams;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    const status = searchParams.get('status') || undefined;

    // 4. Get command logs
    const result = await getRecentCommandLogs({
      limit,
      status,
      userId: aiAuth.user.id,
    });

    // 5. Return result
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}


// API Route: AI Document Ingest - Get single document import
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getDocumentImport } from '@/lib/services/aiIngestService';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';

/**
 * GET - Get a single document import by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Validate authentication
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // 2. Check permissions
    if (!hasPermission(session.user.role, 'ai', 'view')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // 3. Get the document import
    const { id } = await params;
    const docImport = await getDocumentImport(id);

    // 4. Format commands for UI display
    const aiResult = docImport.aiResult as any;
    const commands = (aiResult?.commands || []).map((cmd: any, index: number) => ({
      index,
      command: cmd.command,
      args: cmd.args,
      summary: generateCommandSummary(cmd),
    }));

    // 5. Return response
    return Response.json({
      id: docImport.id,
      sourceType: docImport.sourceType,
      originalName: docImport.originalName,
      contentType: docImport.contentType,
      textPreview: docImport.textPreview,
      status: docImport.status,
      confidence: docImport.confidence,
      documentType: aiResult?.type,
      commands,
      notes: aiResult?.notes,
      error: docImport.error,
      createdAt: docImport.createdAt,
      reviewedAt: docImport.reviewedAt,
      appliedAt: docImport.appliedAt,
      user: docImport.user,
      rawAiResult: aiResult, // Include raw result for debugging
    });

  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Generate a human-readable summary of a command
 */
function generateCommandSummary(cmd: any): string {
  const args = cmd.args || {};
  
  switch (cmd.command?.toUpperCase()) {
    case 'RECEIVE_MATERIAL':
      return `Receive ${args.quantity || '?'} ${args.materialRef || args.material || 'material'}`;

    case 'MOVE_INVENTORY':
      return `Move ${args.quantity || '?'} ${args.itemRef || args.item || 'item'} to ${args.toLocationRef || args.toLocation || args.destination || '?'}`;

    case 'ADJUST_INVENTORY':
      const direction = (args.delta || 0) >= 0 ? 'increase' : 'decrease';
      return `${direction} ${args.itemRef || args.item || 'item'} by ${Math.abs(args.delta || 0)}`;

    case 'CREATE_RETAILER_ORDER':
      const itemCount = args.items?.length || 0;
      return `Create order for ${args.retailerRef || args.retailer || args.customer || '?'} with ${itemCount} item(s)`;

    case 'COMPLETE_BATCH':
      return `Complete batch ${args.batchRef || args.batch || '?'} with yield ${args.yieldQuantity || args.yield || '?'}`;

    case 'CREATE_MATERIAL':
      return `Create material "${args.name || '?'}"`;

    default:
      return `${cmd.command || 'Unknown'} command`;
  }
}

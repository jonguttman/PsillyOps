// API Route: AI Command Interpretation and Execution
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { 
  interpretCommand, 
  executeInterpretedCommand, 
  executeCorrectedCommand,
  resolveCommandReferences 
} from '@/lib/services/aiCommandService';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';

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

    // 2. Check permissions
    if (!hasPermission(session.user.role, 'ai', 'command')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions to use AI commands' },
        { status: 403 }
      );
    }

    // 3. Parse request body
    const body = await req.json();
    const { text, execute, originalCommand, correctedCommand, logId } = body;

    // Handle corrected command execution
    if (correctedCommand && originalCommand && logId) {
      const result = await executeCorrectedCommand(
        originalCommand,
        correctedCommand,
        { userId: session.user.id, logId }
      );

      return Response.json({
        success: result.success,
        logId,
        command: correctedCommand,
        summary: generateCommandSummary(correctedCommand),
        executed: true,
        executionResult: result,
        correctionApplied: true,
      });
    }

    // Standard flow: interpret new command
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Text is required' },
        { status: 400 }
      );
    }

    // 4. Interpret the command
    const { log, command } = await interpretCommand(text.trim(), session.user.id);

    // 5. Resolve references to get readable names
    const resolvedCommand = await resolveCommandReferences(command);

    // 6. Generate human-readable summary
    const summary = generateCommandSummary(resolvedCommand);

    // 7. If execute flag is set, execute immediately
    let executionResult = null;
    if (execute === true) {
      executionResult = await executeInterpretedCommand(resolvedCommand, {
        userId: session.user.id,
        logId: log.id,
      });
    }

    // 8. Return response
    return Response.json({
      success: true,
      logId: log.id,
      command: resolvedCommand,
      summary,
      executed: execute === true,
      executionResult,
    });

  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Generate a human-readable summary of what the command will do
 */
function generateCommandSummary(cmd: any): string {
  switch (cmd.command) {
    case 'RECEIVE_MATERIAL':
      return `Receive ${cmd.args.quantity} ${cmd.resolved?.materialName || cmd.args.materialRef} to ${cmd.resolved?.locationName || 'inventory'}${cmd.args.lotNumber ? ` (Lot: ${cmd.args.lotNumber})` : ''}`;

    case 'MOVE_INVENTORY':
      return `Move ${cmd.args.quantity} ${cmd.args.itemRef} to ${cmd.resolved?.toLocationName || cmd.args.toLocationRef}`;

    case 'ADJUST_INVENTORY':
      const direction = cmd.args.delta > 0 ? 'increase' : 'decrease';
      return `${direction} ${cmd.args.itemRef} by ${Math.abs(cmd.args.delta)}: ${cmd.args.reason}`;

    case 'CREATE_RETAILER_ORDER':
      const itemCount = cmd.resolved?.items?.length || cmd.args.items?.length || 0;
      return `Create order for ${cmd.resolved?.retailerName || cmd.args.retailerRef} with ${itemCount} item(s)`;

    case 'COMPLETE_BATCH':
      return `Complete batch ${cmd.resolved?.batchCode || cmd.args.batchRef} with yield of ${cmd.args.yieldQuantity}${cmd.args.lossQuantity ? ` (loss: ${cmd.args.lossQuantity})` : ''}`;

    case 'CREATE_MATERIAL':
      return `Create new material "${cmd.args.name}"${cmd.args.sku ? ` (SKU: ${cmd.args.sku})` : ''}`;

    default:
      return `Execute ${cmd.command}`;
  }
}

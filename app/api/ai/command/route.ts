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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:16',message:'API route entered',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:69',message:'Before interpretCommand',data:{inputText:text.trim()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const { log, command } = await interpretCommand(text.trim(), session.user.id);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:73',message:'After interpretCommand',data:{command:command.command,args:command.args,resolved:command.resolved},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion

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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:100',message:'Caught error in route',data:{error:error instanceof Error ? error.message : String(error),stack:error instanceof Error ? error.stack?.split('\n').slice(0,5) : null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D,E'})}).catch(()=>{});
    // #endregion
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
      if (cmd.args.targetQuantity !== undefined) {
        return `Set ${cmd.args.itemRef} quantity to ${cmd.args.targetQuantity}: ${cmd.args.reason}`;
      }
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

// API Route: AI Command Interpretation and Execution
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { interpretCommand, executeInterpretedCommand, resolveCommandReferences, type AICommandInterpretation } from '@/lib/services/aiCommandService';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db/prisma';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity, MaterialCategory, Prisma } from '@prisma/client';
import { AICommandStatus } from '@/lib/types/enums';
import { addAdhocRunStep, reorderRunSteps, skipStep } from '@/lib/services/productionRunService';

type JsonRecord = Record<string, unknown>;
function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null;
}
function getString(obj: unknown, key: string): string | undefined {
  if (!isRecord(obj)) return undefined;
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function getPathnameFromContext(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  const ctx = body.context;
  if (!isRecord(ctx)) return undefined;
  const pathname = ctx.pathname;
  return typeof pathname === 'string' ? pathname : undefined;
}

function runIdFromPathname(pathname: string | undefined): string | undefined {
  if (!pathname) return undefined;
  const m = pathname.match(/^\/production-runs\/([^\/\?]+)/);
  return m ? m[1] : undefined;
}

type ProposedRunEditOp =
  | { op: 'ADD_STEP'; label: string; required: boolean }
  | { op: 'SKIP_STEP'; stepId: string; reason: string }
  | { op: 'REORDER_STEPS'; orderedStepIds: string[] };

async function maybeBuildRunEditProposal(params: {
  text: string;
  runId?: string;
  userId: string;
}): Promise<
  | null
  | {
      logId: string;
      runId: string;
      operations: ProposedRunEditOp[];
      confirmationText: string;
    }
> {
  const { text, runId, userId } = params;
  if (!runId) return null;

  const t = text.trim();
  const lower = t.toLowerCase();

  // Heuristics for Phase 5.3 proposal-only run edits.
  const wantsAddPackaging = /\badd\b/.test(lower) && /\bpackag/.test(lower) && /\bstep\b/.test(lower);
  const wantsReorderPackagingLast =
    /\breorder\b/.test(lower) && /\bpackag/.test(lower) && (/\blast\b/.test(lower) || /\bat the end\b/.test(lower));
  const wantsSkipLabeling = /\bskip\b/.test(lower) && /\blabel/.test(lower);

  if (!wantsAddPackaging && !wantsReorderPackagingLast && !wantsSkipLabeling) return null;

  const prismaWithRun = prisma as unknown as {
    productionRun: { findUnique: (args: unknown) => Promise<unknown> };
  };
  const runUnknown = await prismaWithRun.productionRun.findUnique({
    where: { id: runId },
    include: { steps: { orderBy: { order: 'asc' }, select: { id: true, label: true, templateKey: true, order: true } } },
  });
  if (!isRecord(runUnknown) || !Array.isArray(runUnknown.steps)) return null;
  const steps = (runUnknown.steps as unknown[]).filter(isRecord).map((s) => ({
    id: typeof s.id === 'string' ? s.id : '',
    label: typeof s.label === 'string' ? s.label : '',
    templateKey: typeof s.templateKey === 'string' ? s.templateKey : '',
    order: typeof s.order === 'number' ? s.order : 0,
  }));
  if (steps.some((s) => !s.id)) return null;

  const operations: ProposedRunEditOp[] = [];

  if (wantsSkipLabeling) {
    const reasonMatch = t.match(/reason\s+(.+)$/i);
    const reason = (reasonMatch ? reasonMatch[1] : '').trim();
    const labelStep =
      steps.find((s) => s.templateKey.toLowerCase() === 'label') || steps.find((s) => s.label.toLowerCase().includes('label'));
    if (!labelStep) {
      return null;
    }
    operations.push({ op: 'SKIP_STEP', stepId: labelStep.id, reason: reason || 'AI-proposed skip' });
  } else if (wantsReorderPackagingLast) {
    const packaging =
      steps.find((s) => s.templateKey.toLowerCase().includes('pack')) || steps.find((s) => s.label.toLowerCase().includes('pack'));
    if (!packaging) return null;
    const ids = steps.map((s) => s.id).filter((id) => id !== packaging.id);
    ids.push(packaging.id);
    operations.push({ op: 'REORDER_STEPS', orderedStepIds: ids });
  } else if (wantsAddPackaging) {
    operations.push({ op: 'ADD_STEP', label: 'Packaging', required: true });
  }

  if (operations.length === 0) return null;

  const log = await prisma.aICommandLog.create({
    data: {
      userId,
      inputText: t,
      normalized: 'PROPOSE_RUN_EDIT',
      status: AICommandStatus.PENDING,
      aiResult: { kind: 'PROPOSE_RUN_EDIT', runId, operations } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return {
    logId: log.id,
    runId,
    operations,
    confirmationText: `I’ve prepared changes to this production run.\nPlease review and confirm before anything is modified.`,
  };
}

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
    const body: unknown = await req.json();
    const text = getString(body, 'text');
    const execute = isRecord(body) ? body['execute'] : undefined;

    // Phase 2: confirmed creation (explicit button-driven confirmation)
    if (isRecord(body) && body.confirm === true) {
      return await confirmProposedCreate(body, session.user.id, session.user.role);
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Text is required' },
        { status: 400 }
      );
    }

    // Phase 5.3: proposal-only run edits ("this run" supported via pathname context)
    const pathname = getPathnameFromContext(body);
    const runIdFromContext = runIdFromPathname(pathname);
    const runEditProposal = await maybeBuildRunEditProposal({
      text: text.trim(),
      runId: runIdFromContext,
      userId: session.user.id,
    });
    if (runEditProposal) {
      await logAction({
        entityType: 'PRODUCTION_RUN' as unknown as ActivityEntity,
        entityId: runEditProposal.runId,
        action: 'ai_propose_run_edit',
        userId: session.user.id,
        summary: `AI proposed run edits`,
        details: { operations: runEditProposal.operations },
        tags: ['ai', 'production', 'proposal'],
      });

      return Response.json({
        success: true,
        logId: runEditProposal.logId,
        type: 'PROPOSE_RUN_EDIT',
        runId: runEditProposal.runId,
        operations: runEditProposal.operations,
        confirmationText: runEditProposal.confirmationText,
      });
    }

    // 4. Interpret the command
    const { log, command } = await interpretCommand(text.trim(), session.user.id);

    // 5. Resolve references to get readable names
    const resolvedCommand = await resolveCommandReferences(command);

    // 6. Generate human-readable summary
    const summary = generateCommandSummary(resolvedCommand);

    // Phase 2: propose create (no write yet)
    if (resolvedCommand?.command === 'PROPOSE_CREATE_STRAIN' || resolvedCommand?.command === 'PROPOSE_CREATE_MATERIAL') {
      const entity = resolvedCommand.command === 'PROPOSE_CREATE_STRAIN' ? 'strain' : 'material';
      const proposedName = (resolvedCommand.args?.name as string | undefined) || undefined;

      // If it already exists, switch to navigation instead of proposing a write.
      const existing = await findExistingEntity(entity, proposedName);
      if (existing) {
        const destination = entity === 'strain' ? `/strains/${existing.id}` : `/materials/${existing.id}`;

        await prisma.aICommandLog.update({
          where: { id: log.id },
          data: {
            status: AICommandStatus.APPLIED,
            appliedAt: new Date(),
            executedPayload: resolvedCommand as unknown as Prisma.InputJsonValue,
          }
        });

        await logAction({
          entityType: ActivityEntity.SYSTEM,
          entityId: log.id,
          action: 'ai_navigate_entity',
          userId: session.user.id,
          summary: `AI prepared navigation to existing ${entity}: ${existing.name}`,
          details: { entity, destination, existing },
          tags: ['ai', 'navigation', 'prepare'],
        });

        return Response.json({
          success: true,
          logId: log.id,
          type: 'NAVIGATION',
          destination,
          message: `That ${entity} already exists — opening it.`,
        });
      }

      const prefill =
        entity === 'strain'
          ? {
              name: proposedName,
              ...(await (async () => {
                if (!proposedName) return {};
                const suggested = suggestStrainShortCode(proposedName);
                if (!suggested) return {};
                const prismaWithStrain = prisma as unknown as {
                  strain: { findFirst: (args: unknown) => Promise<unknown> };
                };
                const conflict = await prismaWithStrain.strain.findFirst({
                  where: { shortCode: suggested.toUpperCase() },
                  select: { id: true },
                });
                if (isRecord(conflict)) {
                  return { shortCodeNeedsManual: true };
                }
                return { shortCode: suggested };
              })()),
            }
          : {
              name: proposedName,
              categoryHint: resolvedCommand.command === 'PROPOSE_CREATE_MATERIAL' ? resolvedCommand.args?.categoryHint : undefined,
              category: mapCategoryHintToMaterialCategory(
                resolvedCommand.command === 'PROPOSE_CREATE_MATERIAL' ? resolvedCommand.args?.categoryHint : undefined,
                proposedName
              ),
              unitOfMeasure: guessMaterialUnitOfMeasure(
                proposedName,
                resolvedCommand.command === 'PROPOSE_CREATE_MATERIAL' ? resolvedCommand.args?.categoryHint : undefined
              ),
              sku: proposedName ? generateMaterialSku(proposedName) : undefined,
            };

      await logAction({
        entityType: ActivityEntity.SYSTEM,
        entityId: log.id,
        action: 'ai_propose_create_entity',
        userId: session.user.id,
        summary: `AI prepared create ${entity}${proposedName ? `: ${proposedName}` : ''}`,
        details: { entity, prefill },
        tags: ['ai_command', 'proposal'],
      });

      return Response.json({
        success: true,
        logId: log.id,
        type: 'PROPOSE_CREATE',
        entity,
        prefill,
        confirmationText: `I’ve prepared a new ${entity} named ${proposedName || '(unnamed)'}.\nPlease review and confirm before it’s created.`,
      });
    }

    // Phase 5.2: propose create production run (no write yet; UI must confirm)
    if (resolvedCommand?.command === 'PROPOSE_CREATE_PRODUCTION_RUN') {
      const resolved = (resolvedCommand as unknown as { resolved?: unknown }).resolved;
      const resolvedRec = isRecord(resolved) ? resolved : null;

      const ambiguous = resolvedRec ? resolvedRec['ambiguous'] === true : false;
      const choices = resolvedRec && Array.isArray(resolvedRec['choices']) ? (resolvedRec['choices'] as unknown[]) : [];

      if (ambiguous && choices.length > 0) {
        return Response.json({
          success: true,
          logId: log.id,
          type: 'NEEDS_INPUT',
          kind: 'production_run_product',
          message: 'Which product did you mean?',
          choices,
        });
      }

      const productId = getString(resolvedRec, 'productId');
      const productName = getString(resolvedRec, 'productName');
      const productSku = getString(resolvedRec, 'productSku');
      const defaultBatchSize =
        resolvedRec && typeof resolvedRec['defaultBatchSize'] === 'number' ? (resolvedRec['defaultBatchSize'] as number) : undefined;

      if (!productId || !productName || !productSku) {
        return Response.json(
          {
            success: false,
            logId: log.id,
            message: 'I couldn’t find a matching product for that run. Try a more specific product name or SKU.',
          },
          { status: 400 }
        );
      }

      const qtyArg =
        isRecord(resolvedCommand.args) && typeof resolvedCommand.args.quantity === 'number'
          ? resolvedCommand.args.quantity
          : undefined;
      const suggestedQuantity = qtyArg || defaultBatchSize || undefined;

      await logAction({
        entityType: ActivityEntity.SYSTEM,
        entityId: log.id,
        action: 'ai_propose_create_production_run',
        userId: session.user.id,
        summary: `AI prepared a production run: ${productName}${suggestedQuantity ? ` × ${suggestedQuantity}` : ''}`,
        details: { productId, productName, productSku, suggestedQuantity },
        tags: ['ai_command', 'proposal'],
      });

      return Response.json({
        success: true,
        logId: log.id,
        type: 'PROPOSE_CREATE_PRODUCTION_RUN',
        product: { id: productId, name: productName, sku: productSku },
        suggestedQuantity,
        missingFields: qtyArg ? [] : ['quantity'],
        confirmationText: `I’ve prepared a new production run for ${productName}.\nPlease review and confirm before it’s created.`,
      });
    }

    // Phase 1.5: navigation + lookup (read-only)
    if (resolvedCommand?.command === 'NAVIGATE_VIEW_ENTITY' || resolvedCommand?.command === 'NAVIGATE_DASHBOARD_SECTION') {
      const destination = destinationForNavigationCommand(resolvedCommand);

      await prisma.aICommandLog.update({
        where: { id: log.id },
        data: {
          status: AICommandStatus.APPLIED,
          appliedAt: new Date(),
          executedPayload: resolvedCommand as unknown as Prisma.InputJsonValue,
        }
      });

      const summaryLabel =
        resolvedCommand.command === 'NAVIGATE_DASHBOARD_SECTION'
          ? resolvedCommand.args.section
          : (resolvedCommand.resolved?.name || resolvedCommand.args.ref);

      await logAction({
        entityType: ActivityEntity.SYSTEM,
        entityId: log.id,
        action: 'ai_navigate_entity',
        userId: session.user.id,
        summary: `AI prepared navigation to ${summaryLabel}`,
        details: {
          command: resolvedCommand.command,
          destination,
          args: resolvedCommand.args,
          resolved: (resolvedCommand as unknown as { resolved?: unknown }).resolved,
        },
        tags: ['ai', 'navigation', 'prepare'],
      });

      return Response.json({
        success: true,
        logId: log.id,
        type: 'NAVIGATION',
        destination,
        message: 'AI prepared navigation for you.',
      });
    }

    // Phase 1: navigation-only commands (strains/materials)
    if (resolvedCommand?.command === 'NAVIGATE_ADD_STRAIN' || resolvedCommand?.command === 'NAVIGATE_ADD_MATERIAL') {
      const isStrain = resolvedCommand.command === 'NAVIGATE_ADD_STRAIN';
      const destination = isStrain ? '/strains/new' : '/materials/new';
      const prefill = isStrain
        ? { name: resolvedCommand.args?.name }
        : { name: resolvedCommand.args?.name, categoryHint: resolvedCommand.args?.categoryHint };

      // Mark the AI command log as applied (navigation is the "execution" here)
      await prisma.aICommandLog.update({
        where: { id: log.id },
        data: {
          status: AICommandStatus.APPLIED,
          appliedAt: new Date(),
          executedPayload: resolvedCommand as unknown as Prisma.InputJsonValue,
        }
      });

      // Light logging: one ActivityLog entry to keep an audit trail
      await logAction({
        entityType: ActivityEntity.SYSTEM,
        entityId: log.id,
        action: 'ai_navigate_add_entity',
        userId: session.user.id,
        summary: `AI prepared add ${isStrain ? 'strain' : 'material'} form`,
        details: {
          entityType: isStrain ? 'Strain' : 'Material',
          name: resolvedCommand.args?.name,
          destination,
          prefill,
        },
        tags: ['ai_command', 'navigation', isStrain ? 'strain' : 'material'],
      });

      return Response.json({
        success: true,
        logId: log.id,
        type: 'NAVIGATION',
        destination,
        prefill,
        message: 'AI prepared this form for you — review before saving.',
      });
    }

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
function generateCommandSummary(cmd: AICommandInterpretation): string {
  switch (cmd.command) {
    case 'NAVIGATE_ADD_STRAIN':
      return `Open Add Strain${cmd.args?.name ? ` (prefill: "${cmd.args.name}")` : ''}`;

    case 'NAVIGATE_ADD_MATERIAL':
      return `Open Add Material${cmd.args?.name ? ` (prefill: "${cmd.args.name}")` : ''}`;

    case 'NAVIGATE_VIEW_ENTITY':
      return `Navigate to ${cmd.args?.entityType || 'entity'}: ${cmd.args?.ref || ''}`.trim();

    case 'NAVIGATE_DASHBOARD_SECTION':
      return `Open ${cmd.args?.section || 'dashboard'} section`;

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

function destinationForNavigationCommand(cmd: AICommandInterpretation): string {
  if (cmd.command === 'NAVIGATE_DASHBOARD_SECTION') {
    switch (cmd.args.section) {
      case 'inventory':
        return '/inventory';
      case 'activity':
        return '/activity';
      case 'purchase-orders':
        return '/purchase-orders';
      default:
        return '/dashboard';
    }
  }

  if (cmd.command === 'NAVIGATE_VIEW_ENTITY') {
    const entityType = cmd.resolved?.entityType || cmd.args.entityType;
    const id = cmd.resolved?.id;
    if (entityType === 'strain') return id ? `/strains/${id}` : '/strains';
    if (entityType === 'material') return id ? `/materials/${id}` : '/materials';
    return id ? `/products/${id}` : '/products';
  }

  return '/dashboard';
}

async function confirmProposedCreate(
  body: JsonRecord,
  userId: string,
  userRole: string
): Promise<Response> {
  const logId = typeof body.logId === 'string' ? body.logId : null;
  const proposed = body.proposedAction;

  if (!logId) {
    return Response.json({ code: 'VALIDATION_ERROR', message: 'logId is required' }, { status: 400 });
  }

  if (!isRecord(proposed) || typeof proposed.type !== 'string') {
    return Response.json({ code: 'VALIDATION_ERROR', message: 'proposedAction is required' }, { status: 400 });
  }

  // Phase 5.3: confirmed run edits (explicit confirmation only)
  if (proposed.type === 'PROPOSE_RUN_EDIT') {
    if (!['ADMIN', 'PRODUCTION'].includes(userRole)) {
      return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions to edit runs' }, { status: 403 });
    }

    const runId = typeof proposed.runId === 'string' ? proposed.runId : null;
    const operationsRaw = proposed.operations;
    if (!runId || !Array.isArray(operationsRaw) || operationsRaw.length === 0) {
      return Response.json({ code: 'VALIDATION_ERROR', message: 'runId and operations are required' }, { status: 400 });
    }

    // Apply operations in order, using existing service logic.
    for (const opUnknown of operationsRaw) {
      if (!isRecord(opUnknown) || typeof opUnknown.op !== 'string') {
        return Response.json({ code: 'VALIDATION_ERROR', message: 'Invalid operation' }, { status: 400 });
      }
      const op = opUnknown.op;
      if (op === 'ADD_STEP') {
        const label = typeof opUnknown.label === 'string' ? opUnknown.label : '';
        const required = typeof opUnknown.required === 'boolean' ? opUnknown.required : true;
        await addAdhocRunStep({ runId, label, required, userId });
      } else if (op === 'REORDER_STEPS') {
        const orderedStepIds = Array.isArray(opUnknown.orderedStepIds)
          ? (opUnknown.orderedStepIds as unknown[]).filter((x): x is string => typeof x === 'string')
          : [];
        await reorderRunSteps({ runId, orderedStepIds, userId });
      } else if (op === 'SKIP_STEP') {
        const stepId = typeof opUnknown.stepId === 'string' ? opUnknown.stepId : '';
        const reason = typeof opUnknown.reason === 'string' ? opUnknown.reason : '';
        await skipStep(stepId, reason, userId, userRole);
      } else {
        return Response.json({ code: 'VALIDATION_ERROR', message: `Unknown op: ${op}` }, { status: 400 });
      }
    }

    await prisma.aICommandLog.update({
      where: { id: logId },
      data: {
        status: AICommandStatus.APPLIED,
        appliedAt: new Date(),
        executedPayload: { type: 'CONFIRM_RUN_EDIT', runId, operations: operationsRaw } as unknown as Prisma.InputJsonValue,
      },
    });

    await logAction({
      entityType: 'PRODUCTION_RUN' as unknown as ActivityEntity,
      entityId: runId,
      action: 'ai_propose_run_edit_confirmed',
      userId,
      summary: 'AI run edit applied (confirmed)',
      details: { runId, operations: operationsRaw },
      tags: ['ai', 'production', 'confirmed'],
    });

    return Response.json({
      success: true,
      logId,
      type: 'NAVIGATION',
      destination: `/production-runs/${runId}?aiRunEdit=1`,
      message: 'Run updated.',
    });
  }

  if (proposed.type !== 'PROPOSE_CREATE') {
    return Response.json({ code: 'VALIDATION_ERROR', message: 'Invalid proposedAction type' }, { status: 400 });
  }

  const entity = proposed.entity;
  if (entity !== 'strain' && entity !== 'material') {
    return Response.json({ code: 'VALIDATION_ERROR', message: 'Invalid entity' }, { status: 400 });
  }

  // Permission parity with UI forms:
  // - strains: ADMIN only
  // - materials: not REP
  if (entity === 'strain' && userRole !== 'ADMIN') {
    return Response.json({ code: 'FORBIDDEN', message: 'Only ADMIN can create strains' }, { status: 403 });
  }
  if (entity === 'material' && userRole === 'REP') {
    return Response.json({ code: 'FORBIDDEN', message: 'Insufficient permissions to create materials' }, { status: 403 });
  }

  const prefill = isRecord(proposed.prefill) ? proposed.prefill : {};
  const name = (getString(prefill, 'name') || '').trim();
  if (!name) {
    return Response.json({ code: 'VALIDATION_ERROR', message: 'Name is required' }, { status: 400 });
  }

  // If it already exists, switch to navigation instead of creating.
  const existing = await findExistingEntity(entity, name);
  if (existing) {
    const destination = entity === 'strain' ? `/strains/${existing.id}` : `/materials/${existing.id}`;
    await prisma.aICommandLog.update({
      where: { id: logId },
      data: {
        status: AICommandStatus.APPLIED,
        appliedAt: new Date(),
        executedPayload: { type: 'CONFIRM_EXISTING', entity, existing } as unknown as Prisma.InputJsonValue,
      }
    });

    await logAction({
      entityType: ActivityEntity.SYSTEM,
      entityId: logId,
      action: 'ai_navigate_entity',
      userId,
      summary: `AI prepared navigation to existing ${entity}: ${existing.name}`,
      details: { entity, destination, existing },
      tags: ['ai', 'navigation', 'prepare'],
    });

    return Response.json({
      success: true,
      logId,
      type: 'NAVIGATION',
      destination,
      message: `That ${entity} already exists — opening it.`,
    });
  }

  if (entity === 'strain') {
    const shortCodeRaw = getString(prefill, 'shortCode') || suggestStrainShortCode(name);
    const shortCode = shortCodeRaw.toUpperCase().trim();
    if (!shortCode) {
      return Response.json({ code: 'VALIDATION_ERROR', message: 'Short code is required' }, { status: 400 });
    }

    // Uniqueness checks
    const prismaWithStrain = prisma as unknown as {
      strain: {
        findFirst: (args: unknown) => Promise<unknown>;
        create: (args: unknown) => Promise<unknown>;
      };
    };
    const dup = await prismaWithStrain.strain.findFirst({
      where: { OR: [{ name }, { shortCode }] },
      select: { id: true, name: true, shortCode: true },
    });
    if (isRecord(dup) && typeof dup.id === 'string' && typeof dup.name === 'string') {
      const destination = `/strains/${dup.id}`;
      await logAction({
        entityType: ActivityEntity.SYSTEM,
        entityId: logId,
        action: 'ai_navigate_entity',
        userId,
        summary: `AI prepared navigation to existing strain: ${dup.name}`,
        details: { entity, destination, existing: dup },
        tags: ['ai', 'navigation', 'prepare'],
      });
      return Response.json({ success: true, logId, type: 'NAVIGATION', destination, message: 'Strain already exists — opening it.' });
    }

    const createdUnknown = await prismaWithStrain.strain.create({
      data: {
        name,
        shortCode,
        aliases: JSON.stringify([]),
        active: true,
      },
      select: { id: true, name: true, shortCode: true, active: true },
    });
    if (!isRecord(createdUnknown) || typeof createdUnknown.id !== 'string' || typeof createdUnknown.name !== 'string') {
      return Response.json({ code: 'INTERNAL_ERROR', message: 'Failed to create strain' }, { status: 500 });
    }
    const created = createdUnknown as { id: string; name: string; shortCode?: string; active?: boolean };

    await prisma.aICommandLog.update({
      where: { id: logId },
      data: {
        status: AICommandStatus.APPLIED,
        appliedAt: new Date(),
        executedPayload: { type: 'CONFIRM_CREATE', entity, created } as unknown as Prisma.InputJsonValue,
      }
    });

    await logAction({
      entityType: ActivityEntity.SYSTEM,
      entityId: created.id,
      action: 'ai_create_entity_confirmed',
      userId,
      summary: `AI created strain (confirmed): ${created.name}`,
      details: { entity, before: null, after: created },
      tags: ['ai', 'create', 'confirmed'],
    });

    return Response.json({
      success: true,
      logId,
      type: 'NAVIGATION',
      destination: `/strains/${created.id}`,
      message: 'Strain created.',
    });
  }

  // material
  const categoryHint = getString(prefill, 'categoryHint');
  const category = mapCategoryHintToMaterialCategory(categoryHint, name) || MaterialCategory.OTHER;
  const unitOfMeasure = getString(prefill, 'unitOfMeasure') || guessMaterialUnitOfMeasure(name, categoryHint);
  const sku = getString(prefill, 'sku') || generateMaterialSku(name);

  const created = await prisma.rawMaterial.create({
    data: {
      name,
      sku,
      unitOfMeasure,
      category,
      active: true,
      reorderPoint: 0,
      reorderQuantity: 0,
      moq: 0,
      leadTimeDays: 0,
    },
    select: { id: true, name: true, sku: true, unitOfMeasure: true, category: true, active: true },
  });

  await prisma.aICommandLog.update({
    where: { id: logId },
    data: {
      status: AICommandStatus.APPLIED,
      appliedAt: new Date(),
      executedPayload: { type: 'CONFIRM_CREATE', entity, created } as unknown as Prisma.InputJsonValue,
    }
  });

  await logAction({
    entityType: ActivityEntity.SYSTEM,
    entityId: created.id,
    action: 'ai_create_entity_confirmed',
    userId,
    summary: `AI created material (confirmed): ${created.name}`,
    details: { entity, before: null, after: created },
    tags: ['ai', 'create', 'confirmed'],
  });

  return Response.json({
    success: true,
    logId,
    type: 'NAVIGATION',
    destination: `/materials/${created.id}`,
    message: 'Material created.',
  });
}

async function findExistingEntity(entity: 'strain' | 'material', name?: string) {
  if (!name) return null;
  if (entity === 'strain') {
    const prismaWithStrain = prisma as unknown as {
      strain: { findFirst: (args: unknown) => Promise<unknown> };
    };
    const found = await prismaWithStrain.strain.findFirst({
      where: { name: name.trim() },
      select: { id: true, name: true, shortCode: true },
    });
    if (!isRecord(found) || typeof found.id !== 'string' || typeof found.name !== 'string') return null;
    return found as { id: string; name: string; shortCode?: string };
  }
  return await prisma.rawMaterial.findFirst({
    where: { name: name.trim(), active: true },
    select: { id: true, name: true, sku: true },
  });
}

function suggestStrainShortCode(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return '';

  const words = cleaned
    .split(/[\s\-_/]+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ''))
    .filter((w) => w.length > 0);

  if (words.length >= 2) {
    const code = words.slice(0, 3).map((w) => w[0]).join('');
    return code.toUpperCase();
  }

  const single = words[0] || cleaned.replace(/[^A-Za-z0-9]/g, '');
  return single.slice(0, 3).toUpperCase();
}

function generateMaterialSku(name: string): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 6);
  const suffix = Date.now().toString(36).toUpperCase().slice(-4);
  return `${prefix}-${suffix}`;
}

function mapCategoryHintToMaterialCategory(hint: string | undefined, name?: string): MaterialCategory | undefined {
  const upper = (hint || '').trim().toUpperCase();
  const lowerName = (name || '').toLowerCase();

  if (upper === 'PACKAGING') {
    if (lowerName.includes('label') || lowerName.includes('sticker')) return MaterialCategory.LABEL;
    return MaterialCategory.PACKAGING;
  }
  if (upper === 'INGREDIENT') return MaterialCategory.ACTIVE_INGREDIENT;
  if (upper === 'STRAIN') return MaterialCategory.ACTIVE_INGREDIENT;
  if (upper === 'OTHER') return MaterialCategory.OTHER;
  return undefined;
}

function guessMaterialUnitOfMeasure(name: string | undefined, hint: string | undefined): string {
  const n = (name || '').toLowerCase();
  const h = (hint || '').toLowerCase();
  if (h.includes('packaging') || n.match(/\b(capsule|capsules|cap|lid|jar|bottle|box|carton|bag|pouch|label|labels|sticker|stickers)\b/)) {
    return 'pcs';
  }
  return 'g';
}
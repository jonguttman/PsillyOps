/**
 * API Route: POST /api/ai/validate-order
 * 
 * STEP 1 of the AI order creation flow.
 * 
 * Validates and resolves AI-parsed order payloads.
 * Returns resolved IDs, warnings, confidence score, and proposalParams.
 * 
 * CRITICAL: Ambiguous matches BLOCK proposal creation.
 * GPT must ask user to clarify before calling /api/ai/propose.
 * 
 * USAGE:
 * 1. Call this endpoint with unresolved order data (retailerRef, productRef, etc.)
 * 2. If canCreateProposal === true, pass proposalParams verbatim to /api/ai/propose
 * 3. Do NOT manually reconstruct params - use proposalParams as the canonical output
 * 
 * The backend does NOT re-resolve references during proposal creation.
 * 
 * This endpoint is reusable for:
 * - ChatGPT order parsing
 * - Email ingestion
 * - PDF extraction
 * - Clipboard paste
 */

import { NextRequest } from 'next/server';
import { authenticateAIRequest } from '@/lib/auth/aiAuth';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import {
  aiOrderSchema,
  AISalesOrder,
  AIPurchaseOrder,
} from '@/lib/utils/validators';
import { createProposal } from '@/lib/services/aiProposalService';
import { getOrCreateAISession } from '@/lib/services/aiContextService';
import {
  resolveProductWithConfidence,
  resolveMaterialWithConfidence,
  resolveRetailerWithConfidence,
  resolveVendorWithConfidence,
  getMaterialVendorPricing,
  calculateConfidenceScore,
  hasAmbiguousMatches,
  hasUnresolvedFields,
  CONFIDENCE_PENALTIES,
  MatchType,
  ResolvedProduct,
  ResolvedMaterial,
  ResolvedRetailer,
  ResolvedVendor,
} from '@/lib/services/aiEntityResolver';

// ========================================
// Types
// ========================================

interface ValidationWarning {
  type: 'FUZZY_MATCH' | 'AMBIGUOUS_MATCH' | 'MISSING_PRICING' | 'UNRESOLVED_FIELD' | 'PRICE_MISMATCH';
  field: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  alternatives?: Array<{ id: string; name: string; sku?: string }>;
}

interface ResolvedSalesOrderLineItem {
  productRef: string;
  quantity: number;
  productId: string | null;
  productName: string | null;
  productSku: string | null;
  wholesalePrice: number | null;
  lineTotal: number | null;
  matchType: MatchType;
}

interface ResolvedPurchaseOrderLineItem {
  materialRef: string;
  quantity: number;
  unitCost: number | null;
  materialId: string | null;
  materialName: string | null;
  materialSku: string | null;
  matchType: MatchType;
}

interface ResolvedSalesOrder {
  orderType: 'SALES';
  retailerId: string | null;
  retailerName: string | null;
  retailerMatchType: MatchType;
  requestedShipDate?: string;
  notes?: string;
  lineItems: ResolvedSalesOrderLineItem[];
}

interface ResolvedPurchaseOrder {
  orderType: 'PURCHASE';
  vendorId: string | null;
  vendorName: string | null;
  vendorMatchType: MatchType;
  expectedDeliveryDate?: string;
  notes?: string;
  lineItems: ResolvedPurchaseOrderLineItem[];
}

/**
 * Proposal params ready to pass to /api/ai/propose
 * Consumers SHOULD pass this verbatim - manual reconstruction is discouraged.
 */
interface SalesOrderProposalParams {
  action: 'ORDER_CREATION';
  params: {
    retailerId: string;
    items: Array<{ productId: string; quantity: number }>;
    requestedShipDate?: string;
    notes?: string;
    sourceMeta?: {
      sourceType: 'EMAIL' | 'PASTE' | 'PDF' | 'API';
      sourceId?: string;
      receivedAt?: string;
    };
  };
}

interface PurchaseOrderProposalParams {
  action: 'PURCHASE_ORDER_CREATION';
  params: {
    vendorId: string;
    items: Array<{ materialId: string; quantity: number; unitCost?: number }>;
    expectedDeliveryDate?: string;
    notes?: string;
    sourceMeta?: {
      sourceType: 'EMAIL' | 'PASTE' | 'PDF' | 'API';
      sourceId?: string;
      receivedAt?: string;
    };
  };
}

type ProposalParams = SalesOrderProposalParams | PurchaseOrderProposalParams;

interface ValidationResult {
  valid: boolean;
  canCreateProposal: boolean; // false if any ambiguous matches
  resolvedPayload: ResolvedSalesOrder | ResolvedPurchaseOrder;
  unresolvedFields: string[];
  warnings: ValidationWarning[];
  confidence: number;
  sourceMeta?: {
    sourceType: string;
    sourceId?: string;
    receivedAt?: string;
  };
  /**
   * Ready-to-use params for /api/ai/propose.
   * Only present when canCreateProposal === true.
   * Consumers SHOULD pass this verbatim to /api/ai/propose.
   */
  proposalParams?: ProposalParams;
  /**
   * If autoPropose was true and validation passed, this contains the created proposal.
   * This eliminates the need for a separate /api/ai/propose call.
   */
  proposal?: {
    proposalId: string;
    action: string;
    executionMode: 'EXECUTABLE' | 'PREVIEW_ONLY';
    preview: Record<string, unknown>;
    warnings: Array<{ type: string; message: string; severity: string }>;
    expiresAt: string;
  };
}

// ========================================
// Route Handler
// ========================================

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const aiAuth = await authenticateAIRequest(req);
    if (!aiAuth.authenticated || !aiAuth.user) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // 2. Check permissions (need order create permission)
    if (!hasPermission(aiAuth.user.role, 'orders', 'create')) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions to create orders' },
        { status: 403 }
      );
    }

    // 3. Parse and validate schema
    const body = await req.json();
    const { autoPropose, ...orderData } = body;
    const parseResult = aiOrderSchema.safeParse(orderData);
    
    if (!parseResult.success) {
      return Response.json({
        valid: false,
        canCreateProposal: false,
        errors: parseResult.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message
        })),
        confidence: 0
      }, { status: 400 });
    }

    const order = parseResult.data;

    // 4. Resolve and validate based on order type
    let result: ValidationResult;
    
    if (order.orderType === 'SALES') {
      result = await validateSalesOrder(order);
    } else {
      result = await validatePurchaseOrder(order);
    }

    // 5. If autoPropose is true and validation passed, create proposal automatically
    if (autoPropose && result.canCreateProposal && result.proposalParams) {
      const sessionOrigin = req.headers.get('X-AI-Origin') || 'chatgpt';
      const session = await getOrCreateAISession(aiAuth.user.id, undefined, sessionOrigin);
      
      const proposalResult = await createProposal({
        action: result.proposalParams.action,
        params: result.proposalParams.params,
        aiSessionId: session.sessionToken,
        userId: aiAuth.user.id,
        origin: sessionOrigin,
      });
      
      result.proposal = {
        proposalId: proposalResult.proposalId,
        action: proposalResult.action,
        executionMode: proposalResult.executionMode,
        preview: proposalResult.preview as Record<string, unknown>,
        warnings: proposalResult.warnings,
        expiresAt: proposalResult.expiresAt,
      };
    }

    // 6. Return validation result (with proposal if autoPropose was used)
    return Response.json(result);

  } catch (error) {
    return handleApiError(error);
  }
}

// ========================================
// Sales Order Validation
// ========================================

async function validateSalesOrder(order: AISalesOrder): Promise<ValidationResult> {
  const warnings: ValidationWarning[] = [];
  const unresolvedFields: string[] = [];
  const matchTypes: MatchType[] = [];
  const confidencePenalties: number[] = [];

  // Resolve retailer
  const retailerMatch = await resolveRetailerWithConfidence(order.retailerRef);
  matchTypes.push(retailerMatch.matchType);
  confidencePenalties.push(retailerMatch.confidencePenalty);

  if (retailerMatch.matchType === 'none') {
    unresolvedFields.push('retailerRef');
    warnings.push({
      type: 'UNRESOLVED_FIELD',
      field: 'retailerRef',
      message: `Retailer not found: "${order.retailerRef}"`,
      severity: 'error'
    });
  } else if (retailerMatch.matchType === 'ambiguous') {
    warnings.push({
      type: 'AMBIGUOUS_MATCH',
      field: 'retailerRef',
      message: `Multiple retailers match "${order.retailerRef}". Please specify which one.`,
      severity: 'error',
      alternatives: retailerMatch.alternatives.map(r => ({ id: r.id, name: r.name }))
    });
  } else if (retailerMatch.matchType === 'fuzzy') {
    warnings.push({
      type: 'FUZZY_MATCH',
      field: 'retailerRef',
      message: `Matched "${order.retailerRef}" to "${retailerMatch.entity?.name}". Please confirm.`,
      severity: 'warning'
    });
  }

  // Resolve line items
  const resolvedLineItems: ResolvedSalesOrderLineItem[] = [];
  
  for (let i = 0; i < order.lineItems.length; i++) {
    const item = order.lineItems[i];
    const productMatch = await resolveProductWithConfidence(item.productRef);
    matchTypes.push(productMatch.matchType);
    confidencePenalties.push(productMatch.confidencePenalty);

    const lineItem: ResolvedSalesOrderLineItem = {
      productRef: item.productRef,
      quantity: item.quantity,
      productId: productMatch.entity?.id || null,
      productName: productMatch.entity?.name || null,
      productSku: productMatch.entity?.sku || null,
      wholesalePrice: productMatch.entity?.wholesalePrice || null,
      lineTotal: productMatch.entity?.wholesalePrice 
        ? productMatch.entity.wholesalePrice * item.quantity 
        : null,
      matchType: productMatch.matchType
    };
    resolvedLineItems.push(lineItem);

    const fieldPath = `lineItems[${i}].productRef`;

    if (productMatch.matchType === 'none') {
      unresolvedFields.push(fieldPath);
      warnings.push({
        type: 'UNRESOLVED_FIELD',
        field: fieldPath,
        message: `Product not found: "${item.productRef}"`,
        severity: 'error'
      });
    } else if (productMatch.matchType === 'ambiguous') {
      warnings.push({
        type: 'AMBIGUOUS_MATCH',
        field: fieldPath,
        message: `Multiple products match "${item.productRef}". Please specify which one.`,
        severity: 'error',
        alternatives: productMatch.alternatives.map(p => ({ id: p.id, name: p.name, sku: p.sku }))
      });
    } else if (productMatch.matchType === 'fuzzy') {
      warnings.push({
        type: 'FUZZY_MATCH',
        field: fieldPath,
        message: `Matched "${item.productRef}" to "${productMatch.entity?.name}" (${productMatch.entity?.sku}). Please confirm.`,
        severity: 'warning'
      });
    }

    // Check for missing pricing
    if (productMatch.entity && productMatch.entity.wholesalePrice === null) {
      confidencePenalties.push(CONFIDENCE_PENALTIES.MISSING_PRICING);
      warnings.push({
        type: 'MISSING_PRICING',
        field: fieldPath,
        message: `No wholesale price set for "${productMatch.entity.name}". Line total will be $0.`,
        severity: 'warning'
      });
    }
  }

  const resolvedPayload: ResolvedSalesOrder = {
    orderType: 'SALES',
    retailerId: retailerMatch.entity?.id || null,
    retailerName: retailerMatch.entity?.name || null,
    retailerMatchType: retailerMatch.matchType,
    requestedShipDate: order.requestedShipDate,
    notes: order.notes,
    lineItems: resolvedLineItems
  };

  const confidence = calculateConfidenceScore(confidencePenalties);
  const hasAmbiguous = hasAmbiguousMatches(matchTypes);
  const hasUnresolved = hasUnresolvedFields(matchTypes);
  const canCreateProposal = !hasAmbiguous && !hasUnresolved;

  // Build proposalParams only if we can create a proposal
  let proposalParams: SalesOrderProposalParams | undefined;
  if (canCreateProposal && resolvedPayload.retailerId) {
    // Normalize notes with retailer order number prefix if provided
    const normalizedNotes = normalizeNotesWithRetailerOrder(
      order.notes,
      order.retailerOrderNumber
    );

    proposalParams = {
      action: 'ORDER_CREATION',
      params: {
        retailerId: resolvedPayload.retailerId,
        items: resolvedLineItems
          .filter(li => li.productId !== null)
          .map(li => ({
            productId: li.productId!,
            quantity: li.quantity
          })),
        requestedShipDate: order.requestedShipDate,
        notes: normalizedNotes,
        sourceMeta: order.sourceMeta as SalesOrderProposalParams['params']['sourceMeta']
      }
    };
  }

  return {
    valid: !hasUnresolved,
    canCreateProposal,
    resolvedPayload,
    unresolvedFields,
    warnings,
    confidence,
    sourceMeta: order.sourceMeta,
    proposalParams
  };
}

/**
 * Normalize notes with retailer order number prefix.
 * Idempotent - won't double-prepend if already present.
 */
function normalizeNotesWithRetailerOrder(notes?: string, retailerOrderNumber?: string): string | undefined {
  if (!retailerOrderNumber) return notes;
  
  const prefix = `Retailer Order #: ${retailerOrderNumber}`;
  if (notes?.startsWith(prefix)) return notes;
  
  return `${prefix}\n${notes ?? ''}`.trim();
}

// ========================================
// Purchase Order Validation
// ========================================

async function validatePurchaseOrder(order: AIPurchaseOrder): Promise<ValidationResult> {
  const warnings: ValidationWarning[] = [];
  const unresolvedFields: string[] = [];
  const matchTypes: MatchType[] = [];
  const confidencePenalties: number[] = [];

  // Resolve vendor
  const vendorMatch = await resolveVendorWithConfidence(order.vendorRef);
  matchTypes.push(vendorMatch.matchType);
  confidencePenalties.push(vendorMatch.confidencePenalty);

  if (vendorMatch.matchType === 'none') {
    unresolvedFields.push('vendorRef');
    warnings.push({
      type: 'UNRESOLVED_FIELD',
      field: 'vendorRef',
      message: `Vendor not found: "${order.vendorRef}"`,
      severity: 'error'
    });
  } else if (vendorMatch.matchType === 'ambiguous') {
    warnings.push({
      type: 'AMBIGUOUS_MATCH',
      field: 'vendorRef',
      message: `Multiple vendors match "${order.vendorRef}". Please specify which one.`,
      severity: 'error',
      alternatives: vendorMatch.alternatives.map(v => ({ id: v.id, name: v.name }))
    });
  } else if (vendorMatch.matchType === 'fuzzy') {
    warnings.push({
      type: 'FUZZY_MATCH',
      field: 'vendorRef',
      message: `Matched "${order.vendorRef}" to "${vendorMatch.entity?.name}". Please confirm.`,
      severity: 'warning'
    });
  }

  // Resolve line items
  const resolvedLineItems: ResolvedPurchaseOrderLineItem[] = [];
  
  for (let i = 0; i < order.lineItems.length; i++) {
    const item = order.lineItems[i];
    const materialMatch = await resolveMaterialWithConfidence(item.materialRef);
    matchTypes.push(materialMatch.matchType);
    confidencePenalties.push(materialMatch.confidencePenalty);

    // Determine unit cost
    let unitCost = item.unitCost || null;
    
    // If no unit cost provided and we have both material and vendor, try to get from MaterialVendor
    if (!unitCost && materialMatch.entity && vendorMatch.entity) {
      const pricing = await getMaterialVendorPricing(materialMatch.entity.id, vendorMatch.entity.id);
      if (pricing?.lastPrice) {
        unitCost = pricing.lastPrice;
      }
    }

    const lineItem: ResolvedPurchaseOrderLineItem = {
      materialRef: item.materialRef,
      quantity: item.quantity,
      unitCost,
      materialId: materialMatch.entity?.id || null,
      materialName: materialMatch.entity?.name || null,
      materialSku: materialMatch.entity?.sku || null,
      matchType: materialMatch.matchType
    };
    resolvedLineItems.push(lineItem);

    const fieldPath = `lineItems[${i}].materialRef`;

    if (materialMatch.matchType === 'none') {
      unresolvedFields.push(fieldPath);
      warnings.push({
        type: 'UNRESOLVED_FIELD',
        field: fieldPath,
        message: `Material not found: "${item.materialRef}"`,
        severity: 'error'
      });
    } else if (materialMatch.matchType === 'ambiguous') {
      warnings.push({
        type: 'AMBIGUOUS_MATCH',
        field: fieldPath,
        message: `Multiple materials match "${item.materialRef}". Please specify which one.`,
        severity: 'error',
        alternatives: materialMatch.alternatives.map(m => ({ id: m.id, name: m.name, sku: m.sku }))
      });
    } else if (materialMatch.matchType === 'fuzzy') {
      warnings.push({
        type: 'FUZZY_MATCH',
        field: fieldPath,
        message: `Matched "${item.materialRef}" to "${materialMatch.entity?.name}" (${materialMatch.entity?.sku}). Please confirm.`,
        severity: 'warning'
      });
    }

    // Check for missing pricing
    if (materialMatch.entity && !unitCost) {
      confidencePenalties.push(CONFIDENCE_PENALTIES.MISSING_PRICING);
      warnings.push({
        type: 'MISSING_PRICING',
        field: fieldPath,
        message: `No unit cost available for "${materialMatch.entity.name}". Please provide a price.`,
        severity: 'warning'
      });
    }
  }

  const resolvedPayload: ResolvedPurchaseOrder = {
    orderType: 'PURCHASE',
    vendorId: vendorMatch.entity?.id || null,
    vendorName: vendorMatch.entity?.name || null,
    vendorMatchType: vendorMatch.matchType,
    expectedDeliveryDate: order.expectedDeliveryDate,
    notes: order.notes,
    lineItems: resolvedLineItems
  };

  const confidence = calculateConfidenceScore(confidencePenalties);
  const hasAmbiguous = hasAmbiguousMatches(matchTypes);
  const hasUnresolved = hasUnresolvedFields(matchTypes);
  const canCreateProposal = !hasAmbiguous && !hasUnresolved;

  // Build proposalParams only if we can create a proposal
  let proposalParams: PurchaseOrderProposalParams | undefined;
  if (canCreateProposal && resolvedPayload.vendorId) {
    proposalParams = {
      action: 'PURCHASE_ORDER_CREATION',
      params: {
        vendorId: resolvedPayload.vendorId,
        items: resolvedLineItems
          .filter(li => li.materialId !== null)
          .map(li => ({
            materialId: li.materialId!,
            quantity: li.quantity,
            unitCost: li.unitCost ?? undefined
          })),
        expectedDeliveryDate: order.expectedDeliveryDate,
        notes: order.notes,
        sourceMeta: order.sourceMeta as PurchaseOrderProposalParams['params']['sourceMeta']
      }
    };
  }

  return {
    valid: !hasUnresolved,
    canCreateProposal,
    resolvedPayload,
    unresolvedFields,
    warnings,
    confidence,
    sourceMeta: order.sourceMeta,
    proposalParams
  };
}


/**
 * Scan Resolver Service
 * 
 * Handles barcode detection and entity resolution for mobile scanning.
 * Supports both Psilly QR tokens and external UPC/EAN barcodes.
 * 
 * Resolution flow:
 * 1. Detect barcode type (QR vs UPC/EAN)
 * 2. Resolve to entity (Product, Material, Batch, ProductionRun)
 * 3. Fetch current state
 * 4. Determine valid next actions
 */

import { prisma } from '@/lib/db/prisma';
import { resolveToken, isValidTokenFormat } from '@/lib/services/qrTokenService';
import { LabelEntityType, ProductionRunStatus, BatchStatus, InventoryStatus, PurchaseOrderStatus } from '@prisma/client';

// ============================================
// Types
// ============================================

export type ScanType = 'QR_TOKEN' | 'UPC_PRODUCT' | 'UPC_MATERIAL' | 'UNKNOWN';

export type EntityType = 'PRODUCT' | 'MATERIAL' | 'BATCH' | 'PRODUCTION_RUN' | 'INVENTORY';

export type EntityState = {
  status?: string;
  quantity?: number;
  location?: string;
  additionalInfo?: Record<string, unknown>;
};

export type ActionType = 
  | 'RECEIVE_INVENTORY'
  | 'ADJUST_INVENTORY'
  | 'MOVE_INVENTORY'
  | 'START_RUN'
  | 'ADVANCE_STEP'
  | 'COMPLETE_RUN'
  | 'VIEW_DETAILS'
  | 'PRINT_LABELS'
  | 'LINK_UPC';

export type Action = {
  type: ActionType;
  label: string;
  primary: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

export type POLineMatch = {
  poId: string;
  poNumber: string;
  lineItemId: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityRemaining: number;
  vendorName: string;
};

export type ScanResult = {
  type: ScanType;
  rawValue: string;
  entity?: {
    type: EntityType;
    id: string;
    name: string;
    sku?: string;
    state: EntityState;
  };
  availableActions: Action[];
  openPOLines?: POLineMatch[];
  linkUpcAvailable?: boolean;
};

// ============================================
// Barcode Detection
// ============================================

/**
 * Detect barcode type from raw scanned value
 * 
 * - QR tokens start with 'qr_' or contain '/qr/'
 * - UPC-A: 12 digits
 * - UPC-E: 8 digits
 * - EAN-13: 13 digits
 * - EAN-8: 8 digits
 * - Code 128: variable length alphanumeric
 */
export function detectBarcodeType(rawValue: string): { type: ScanType; normalizedValue: string } {
  const trimmed = rawValue.trim();
  
  // Check for Psilly QR token
  if (trimmed.startsWith('qr_')) {
    return { type: 'QR_TOKEN', normalizedValue: trimmed };
  }
  
  // Check for QR URL containing token
  const qrMatch = trimmed.match(/\/qr\/(qr_[a-zA-Z0-9_-]+)/);
  if (qrMatch) {
    return { type: 'QR_TOKEN', normalizedValue: qrMatch[1] };
  }
  
  // Check for numeric barcode (UPC/EAN)
  const numericOnly = trimmed.replace(/[^0-9]/g, '');
  
  // Validate UPC/EAN lengths and checksums
  if (numericOnly.length === 12 || numericOnly.length === 13) {
    if (validateEANChecksum(numericOnly)) {
      // Will be resolved to product or material
      return { type: 'UPC_PRODUCT', normalizedValue: numericOnly };
    }
  }
  
  if (numericOnly.length === 8) {
    // UPC-E or EAN-8
    return { type: 'UPC_PRODUCT', normalizedValue: numericOnly };
  }
  
  return { type: 'UNKNOWN', normalizedValue: trimmed };
}

/**
 * Validate EAN/UPC checksum (Luhn-like algorithm)
 */
function validateEANChecksum(code: string): boolean {
  if (code.length !== 12 && code.length !== 13) return false;
  
  const digits = code.split('').map(Number);
  const checkDigit = digits.pop()!;
  
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    // For EAN-13: odd positions (0-indexed) multiply by 1, even by 3
    // For UPC-A (12 digits): same pattern
    const multiplier = i % 2 === 0 ? 1 : 3;
    sum += digits[i] * multiplier;
  }
  
  const calculatedCheck = (10 - (sum % 10)) % 10;
  return calculatedCheck === checkDigit;
}

// ============================================
// Entity Resolution
// ============================================

/**
 * Resolve a scanned barcode to an entity and available actions
 */
export async function resolveScan(rawValue: string): Promise<ScanResult> {
  const { type, normalizedValue } = detectBarcodeType(rawValue);
  
  switch (type) {
    case 'QR_TOKEN':
      return resolveQRToken(normalizedValue, rawValue);
    case 'UPC_PRODUCT':
      return resolveUPC(normalizedValue, rawValue);
    default:
      return {
        type: 'UNKNOWN',
        rawValue,
        availableActions: [],
        linkUpcAvailable: false,
      };
  }
}

/**
 * Resolve a Psilly QR token to entity and actions
 */
async function resolveQRToken(token: string, rawValue: string): Promise<ScanResult> {
  if (!isValidTokenFormat(token)) {
    return {
      type: 'UNKNOWN',
      rawValue,
      availableActions: [],
    };
  }
  
  const result = await resolveToken(token);
  
  if (!result || result.status !== 'ACTIVE') {
    return {
      type: 'QR_TOKEN',
      rawValue,
      availableActions: [
        { type: 'VIEW_DETAILS', label: 'View Token Details', primary: true },
      ],
    };
  }
  
  // Check if token is linked to a production run
  const productionRun = await prisma.productionRun.findFirst({
    where: { qrToken: { token } },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      steps: { orderBy: { order: 'asc' } },
    },
  });
  
  if (productionRun) {
    return resolveProductionRun(productionRun, rawValue);
  }
  
  // Resolve based on entity type
  switch (result.entityType) {
    case LabelEntityType.PRODUCT:
      return resolveProduct(result.entityId, rawValue, 'QR_TOKEN');
    case LabelEntityType.BATCH:
      return resolveBatch(result.entityId, rawValue);
    case LabelEntityType.INVENTORY:
      return resolveInventory(result.entityId, rawValue);
    default:
      return {
        type: 'QR_TOKEN',
        rawValue,
        availableActions: [
          { type: 'VIEW_DETAILS', label: 'View Details', primary: true },
        ],
      };
  }
}

/**
 * Resolve a UPC/EAN to product or material
 */
async function resolveUPC(upc: string, rawValue: string): Promise<ScanResult> {
  // Try to find a product with this UPC
  const product = await prisma.product.findFirst({
    where: { upc, active: true },
    select: { id: true, name: true, sku: true, reorderPoint: true },
  });
  
  if (product) {
    return resolveProduct(product.id, rawValue, 'UPC_PRODUCT');
  }
  
  // Try to find a material with this UPC
  const material = await prisma.rawMaterial.findFirst({
    where: { upc, active: true },
    select: { id: true, name: true, sku: true, currentStockQty: true, reorderPoint: true },
  });
  
  if (material) {
    return resolveMaterial(material, rawValue, upc);
  }
  
  // UPC not linked - offer to link it
  return {
    type: 'UPC_PRODUCT',
    rawValue,
    availableActions: [],
    linkUpcAvailable: true,
  };
}

/**
 * Resolve a product entity
 */
async function resolveProduct(
  productId: string, 
  rawValue: string, 
  scanType: ScanType
): Promise<ScanResult> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      inventory: {
        where: { status: InventoryStatus.AVAILABLE },
        select: { quantityOnHand: true },
      },
    },
  });
  
  if (!product) {
    return { type: scanType, rawValue, availableActions: [] };
  }
  
  const totalInventory = product.inventory.reduce((sum, inv) => sum + inv.quantityOnHand, 0);
  
  const actions: Action[] = [
    { type: 'VIEW_DETAILS', label: 'View Product', primary: false },
    { type: 'PRINT_LABELS', label: 'Print Labels', primary: false },
  ];
  
  // If low stock, suggest receiving
  if (totalInventory < product.reorderPoint) {
    actions.unshift({
      type: 'RECEIVE_INVENTORY',
      label: 'Receive Inventory',
      primary: true,
    });
  }
  
  return {
    type: scanType,
    rawValue,
    entity: {
      type: 'PRODUCT',
      id: product.id,
      name: product.name,
      sku: product.sku,
      state: {
        quantity: totalInventory,
        additionalInfo: {
          reorderPoint: product.reorderPoint,
          lowStock: totalInventory < product.reorderPoint,
        },
      },
    },
    availableActions: actions,
  };
}

/**
 * Resolve a material entity with PO-aware receiving
 */
async function resolveMaterial(
  material: { id: string; name: string; sku: string; currentStockQty: number; reorderPoint: number },
  rawValue: string,
  upc: string
): Promise<ScanResult> {
  // Find open PO lines for this material
  const openPOLines = await prisma.purchaseOrderLineItem.findMany({
    where: {
      materialId: material.id,
      purchaseOrder: {
        status: { in: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED] },
      },
    },
    include: {
      purchaseOrder: {
        select: { id: true, poNumber: true, vendor: { select: { name: true } } },
      },
    },
  });
  
  const poLineMatches: POLineMatch[] = openPOLines.map(line => ({
    poId: line.purchaseOrder.id,
    poNumber: line.purchaseOrder.poNumber,
    lineItemId: line.id,
    quantityOrdered: line.quantityOrdered,
    quantityReceived: line.quantityReceived,
    quantityRemaining: line.quantityOrdered - line.quantityReceived,
    vendorName: line.purchaseOrder.vendor.name,
  })).filter(match => match.quantityRemaining > 0);
  
  const actions: Action[] = [];
  
  // Primary action: Receive (PO-aware if available)
  if (poLineMatches.length > 0) {
    actions.push({
      type: 'RECEIVE_INVENTORY',
      label: `Receive (${poLineMatches.length} open PO${poLineMatches.length > 1 ? 's' : ''})`,
      primary: true,
    });
  } else {
    actions.push({
      type: 'RECEIVE_INVENTORY',
      label: 'Receive (No PO)',
      primary: true,
    });
  }
  
  actions.push(
    { type: 'ADJUST_INVENTORY', label: 'Adjust Quantity', primary: false },
    { type: 'VIEW_DETAILS', label: 'View Material', primary: false },
  );
  
  return {
    type: 'UPC_MATERIAL',
    rawValue,
    entity: {
      type: 'MATERIAL',
      id: material.id,
      name: material.name,
      sku: material.sku,
      state: {
        quantity: material.currentStockQty,
        additionalInfo: {
          reorderPoint: material.reorderPoint,
          lowStock: material.currentStockQty < material.reorderPoint,
          upc,
        },
      },
    },
    availableActions: actions,
    openPOLines: poLineMatches.length > 0 ? poLineMatches : undefined,
  };
}

/**
 * Resolve a batch entity
 */
async function resolveBatch(batchId: string, rawValue: string): Promise<ScanResult> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      product: { select: { name: true, sku: true } },
    },
  });
  
  if (!batch) {
    return { type: 'QR_TOKEN', rawValue, availableActions: [] };
  }
  
  const actions: Action[] = [
    { type: 'VIEW_DETAILS', label: 'View Batch', primary: false },
  ];
  
  // Add context-aware actions based on batch status
  switch (batch.status) {
    case BatchStatus.IN_PROGRESS:
      actions.unshift({
        type: 'ADVANCE_STEP',
        label: 'Continue Production',
        primary: true,
      });
      break;
    case BatchStatus.QC_HOLD:
      actions.unshift({
        type: 'VIEW_DETAILS',
        label: 'Review QC Hold',
        primary: true,
      });
      break;
    case BatchStatus.RELEASED:
      actions.unshift(
        { type: 'ADJUST_INVENTORY', label: 'Adjust Quantity', primary: true },
        { type: 'MOVE_INVENTORY', label: 'Move Location', primary: false },
      );
      break;
  }
  
  return {
    type: 'QR_TOKEN',
    rawValue,
    entity: {
      type: 'BATCH',
      id: batch.id,
      name: `${batch.product.name} - ${batch.batchCode}`,
      sku: batch.product.sku,
      state: {
        status: batch.status,
        quantity: batch.actualQuantity ?? batch.plannedQuantity,
        additionalInfo: {
          batchCode: batch.batchCode,
          qcStatus: batch.qcStatus,
        },
      },
    },
    availableActions: actions,
  };
}

/**
 * Resolve an inventory item entity
 */
async function resolveInventory(inventoryId: string, rawValue: string): Promise<ScanResult> {
  const inventory = await prisma.inventoryItem.findUnique({
    where: { id: inventoryId },
    include: {
      product: { select: { name: true, sku: true } },
      material: { select: { name: true, sku: true } },
      location: { select: { name: true } },
    },
  });
  
  if (!inventory) {
    return { type: 'QR_TOKEN', rawValue, availableActions: [] };
  }
  
  const itemName = inventory.product?.name || inventory.material?.name || 'Unknown Item';
  const itemSku = inventory.product?.sku || inventory.material?.sku;
  
  const actions: Action[] = [
    { type: 'ADJUST_INVENTORY', label: 'Adjust Quantity', primary: true },
    { type: 'MOVE_INVENTORY', label: 'Move Location', primary: false },
    { type: 'VIEW_DETAILS', label: 'View Details', primary: false },
  ];
  
  return {
    type: 'QR_TOKEN',
    rawValue,
    entity: {
      type: 'INVENTORY',
      id: inventory.id,
      name: itemName,
      sku: itemSku,
      state: {
        status: inventory.status,
        quantity: inventory.quantityOnHand,
        location: inventory.location?.name,
        additionalInfo: {
          reserved: inventory.quantityReserved,
          lotNumber: inventory.lotNumber,
          expiryDate: inventory.expiryDate,
        },
      },
    },
    availableActions: actions,
  };
}

/**
 * Resolve a production run entity
 */
async function resolveProductionRun(
  run: {
    id: string;
    status: ProductionRunStatus;
    quantity: number;
    product: { id: string; name: string; sku: string };
    steps: Array<{ id: string; status: string; label: string; order: number }>;
  },
  rawValue: string
): Promise<ScanResult> {
  const currentStep = run.steps.find(s => s.status === 'IN_PROGRESS') 
    || run.steps.find(s => s.status === 'PENDING');
  
  const actions: Action[] = [];
  
  switch (run.status) {
    case ProductionRunStatus.PLANNED:
      actions.push({
        type: 'START_RUN',
        label: 'Start Production Run',
        primary: true,
      });
      break;
    case ProductionRunStatus.IN_PROGRESS:
      if (currentStep) {
        actions.push({
          type: 'ADVANCE_STEP',
          label: currentStep.status === 'IN_PROGRESS' 
            ? `Complete: ${currentStep.label}`
            : `Start: ${currentStep.label}`,
          primary: true,
        });
      }
      // Check if all steps are complete
      const allComplete = run.steps.every(s => s.status === 'COMPLETED' || s.status === 'SKIPPED');
      if (allComplete) {
        actions.push({
          type: 'COMPLETE_RUN',
          label: 'Complete Run',
          primary: true,
        });
      }
      break;
    case ProductionRunStatus.COMPLETED:
      actions.push({
        type: 'VIEW_DETAILS',
        label: 'View Completed Run',
        primary: true,
      });
      break;
  }
  
  actions.push({ type: 'VIEW_DETAILS', label: 'View Run Details', primary: false });
  
  return {
    type: 'QR_TOKEN',
    rawValue,
    entity: {
      type: 'PRODUCTION_RUN',
      id: run.id,
      name: `${run.product.name} × ${run.quantity}`,
      sku: run.product.sku,
      state: {
        status: run.status,
        quantity: run.quantity,
        additionalInfo: {
          currentStep: currentStep ? {
            id: currentStep.id,
            label: currentStep.label,
            status: currentStep.status,
            order: currentStep.order,
          } : null,
          totalSteps: run.steps.length,
          completedSteps: run.steps.filter(s => s.status === 'COMPLETED').length,
        },
      },
    },
    availableActions: actions,
  };
}

// ============================================
// UPC Linking
// ============================================

/**
 * Link a UPC to an existing product or material
 */
export async function linkUPC(params: {
  upc: string;
  entityType: 'PRODUCT' | 'MATERIAL';
  entityId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { upc, entityType, entityId } = params;
  
  // Validate UPC format
  const { type } = detectBarcodeType(upc);
  if (type !== 'UPC_PRODUCT') {
    return { success: false, error: 'Invalid UPC format' };
  }
  
  try {
    if (entityType === 'PRODUCT') {
      await prisma.product.update({
        where: { id: entityId },
        data: { upc },
      });
    } else {
      await prisma.rawMaterial.update({
        where: { id: entityId },
        data: { upc },
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to link UPC:', error);
    return { success: false, error: 'Failed to link UPC' };
  }
}

/**
 * Find products/materials that could match a UPC (for linking UI)
 */
export async function findLinkCandidates(searchTerm: string): Promise<{
  products: Array<{ id: string; name: string; sku: string; hasUpc: boolean }>;
  materials: Array<{ id: string; name: string; sku: string; hasUpc: boolean }>;
}> {
  const [products, materials] = await Promise.all([
    prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { sku: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, sku: true, upc: true },
      take: 10,
    }),
    prisma.rawMaterial.findMany({
      where: {
        active: true,
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { sku: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, sku: true, upc: true },
      take: 10,
    }),
  ]);
  
  return {
    products: products.map(p => ({ ...p, hasUpc: !!p.upc })),
    materials: materials.map(m => ({ ...m, hasUpc: !!m.upc })),
  };
}


// AI COMMAND SERVICE
// Interprets natural language commands and executes them via domain services

import { prisma } from '@/lib/db/prisma';

/**
 * Validate userId exists in database before using it
 * Handles stale sessions after database re-seeding
 */
async function validateUserId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user ? userId : null;
}
import { AppError, ErrorCodes } from '@/lib/utils/errors';
import { logAction } from './loggingService';
import { receiveMaterials, moveInventory, adjustInventory } from './inventoryService';
import { createMaterial } from './materialService';
import { createOrder } from './orderService';
import { completeBatch } from './productionService';
import { generateInvoice, generateManifestPdf, getInvoiceByOrderId } from './invoiceService';
import { interpretNaturalLanguageCommand, AIClientError } from './aiClient';
import { ActivityEntity } from '@prisma/client';
import { AICommandStatus } from '@/lib/types/enums';
import { 
  applyMaterialCorrection, 
  applyProductCorrection, 
  applyRetailerCorrection, 
  applyLocationCorrection,
  recordCorrection 
} from './aiCorrectionMemory';

// ========================================
// COMMAND TYPE DEFINITIONS
// ========================================

export type ReceiveMaterialCommand = {
  command: 'RECEIVE_MATERIAL';
  args: {
    materialRef: string;    // e.g. "PE", "Penis Envy", SKU
    quantity: number;
    unit: string;           // e.g. "GRAM", "KILOGRAM", "UNIT"
    locationRef?: string;   // optional: "RAW", "FG", or location name
    lotNumber?: string;
    expiryDate?: string;    // ISO string or MM/YY
    vendorRef?: string;
    note?: string;
  };
  resolved?: {
    materialId?: string;
    materialName?: string;
    locationId?: string;
    locationName?: string;
    vendorId?: string;
    vendorName?: string;
  };
};

export type MoveInventoryCommand = {
  command: 'MOVE_INVENTORY';
  args: {
    itemRef: string;       // inventory ID or batch+product ref
    quantity: number;
    toLocationRef: string; // location name or code
    note?: string;
  };
  resolved?: {
    inventoryId?: string;
    toLocationId?: string;
    toLocationName?: string;
  };
};

export type AdjustInventoryCommand = {
  command: 'ADJUST_INVENTORY';
  args: {
    itemRef: string;
    delta: number;
    targetQuantity?: number; // For "adjust X to Y" commands
    reason: string;
  };
  resolved?: {
    inventoryId?: string;
    currentQuantity?: number; // Current quantity for delta calculation
  };
};

export type CreateRetailerOrderCommand = {
  command: 'CREATE_RETAILER_ORDER';
  args: {
    retailerRef: string;
    items: {
      productRef: string;
      quantity: number;
    }[];
    note?: string;
  };
  resolved?: {
    retailerId?: string;
    retailerName?: string;
    items?: {
      productId: string;
      productName: string;
      quantity: number;
    }[];
  };
};

export type CompleteBatchCommand = {
  command: 'COMPLETE_BATCH';
  args: {
    batchRef: string;
    yieldQuantity: number;
    lossQuantity?: number;
    lossReason?: string;
  };
  resolved?: {
    batchId?: string;
    batchCode?: string;
    productName?: string;
  };
};

export type CreateMaterialCommand = {
  command: 'CREATE_MATERIAL';
  args: {
    name: string;
    sku?: string;
    unit?: string;
    vendorRef?: string;
    description?: string;
  };
  resolved?: {
    vendorId?: string;
    vendorName?: string;
  };
};

export type GenerateInvoiceCommand = {
  command: 'GENERATE_INVOICE';
  args: {
    orderRef?: string;    // Order number or ID
    retailerRef?: string; // Retailer name (will find their most recent shipped order)
  };
  resolved?: {
    orderId?: string;
    orderNumber?: string;
    retailerId?: string;
    retailerName?: string;
  };
};

export type GenerateManifestCommand = {
  command: 'GENERATE_MANIFEST';
  args: {
    orderRef?: string;
    retailerRef?: string;
  };
  resolved?: {
    orderId?: string;
    orderNumber?: string;
    retailerName?: string;
  };
};

export type AICommandInterpretation =
  | ReceiveMaterialCommand
  | MoveInventoryCommand
  | AdjustInventoryCommand
  | CreateRetailerOrderCommand
  | CompleteBatchCommand
  | CreateMaterialCommand
  | GenerateInvoiceCommand
  | GenerateManifestCommand;

export type AICommandExecutionResult = {
  success: boolean;
  message: string;
  details?: any;
};

// ========================================
// COMMON ABBREVIATION MAPPINGS
// ========================================

const MATERIAL_ABBREVIATIONS: Record<string, string[]> = {
  'PE': ['Penis Envy', 'Penis Envy Mushroom'],
  'LM': ['Lions Mane', "Lion's Mane", 'Lions Mane Mushroom'],
  'GT': ['Golden Teacher', 'Golden Teacher Mushroom'],
  'APE': ['Albino Penis Envy'],
  'REISHI': ['Reishi', 'Reishi Mushroom'],
  'CORDYCEPS': ['Cordyceps', 'Cordyceps Mushroom'],
  'CHAGA': ['Chaga', 'Chaga Mushroom'],
};

const PRODUCT_ABBREVIATIONS: Record<string, string[]> = {
  'HERC': ['Hercules', 'Hercules Caps'],
  'MC': ['Micro Caps', 'Microdose Caps', 'Microdose Capsules'],
  'LM': ['Lions Mane', "Lion's Mane"],
  'LMT': ['Lions Mane Tincture'],
};

const LOCATION_ABBREVIATIONS: Record<string, string[]> = {
  'RAW': ['Raw Materials', 'Raw', 'Raw Material Storage'],
  'FG': ['Finished Goods', 'Finished', 'FG Storage'],
  'QA': ['QA Hold', 'Quality Assurance', 'QC'],
  'SHIP': ['Shipping', 'Shipping Area'],
  'REC': ['Receiving', 'Receiving Area'],
};

// ========================================
// RESOLVER HELPERS
// ========================================

/**
 * Resolve a material reference to a material ID
 */
export async function resolveMaterialRef(ref: string): Promise<{
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
} | null> {
  // Apply any learned corrections first
  const correctedRef = applyMaterialCorrection(ref);
  
  // Try exact SKU match first (case-insensitive for SQLite)
  const bySku = await prisma.rawMaterial.findFirst({
    where: { sku: correctedRef.toUpperCase(), active: true },
    select: { id: true, name: true, sku: true, unitOfMeasure: true }
  });
  if (bySku) return bySku;

  // Try name contains match (SQLite LIKE is case-insensitive for ASCII)
  const byName = await prisma.rawMaterial.findFirst({
    where: { name: { contains: correctedRef }, active: true },
    select: { id: true, name: true, sku: true, unitOfMeasure: true }
  });
  if (byName) return byName;

  // Check abbreviations
  const upperRef = correctedRef.toUpperCase();
  const abbreviationMatches = MATERIAL_ABBREVIATIONS[upperRef];
  if (abbreviationMatches) {
    for (const possibleName of abbreviationMatches) {
      const byAbbrev = await prisma.rawMaterial.findFirst({
        where: { name: { contains: possibleName }, active: true },
        select: { id: true, name: true, sku: true, unitOfMeasure: true }
      });
      if (byAbbrev) return byAbbrev;
    }
  }

  return null;
}

/**
 * Resolve a product reference to a product ID
 */
export async function resolveProductRef(ref: string): Promise<{
  id: string;
  name: string;
  sku: string;
} | null> {
  // Apply any learned corrections first
  const correctedRef = applyProductCorrection(ref);
  
  // Try exact SKU match first
  const bySku = await prisma.product.findFirst({
    where: { sku: correctedRef.toUpperCase(), active: true },
    select: { id: true, name: true, sku: true }
  });
  if (bySku) return bySku;

  // Try name contains match
  const byName = await prisma.product.findFirst({
    where: { name: { contains: correctedRef }, active: true },
    select: { id: true, name: true, sku: true }
  });
  if (byName) return byName;

  // Check abbreviations
  const upperRef = correctedRef.toUpperCase();
  const abbreviationMatches = PRODUCT_ABBREVIATIONS[upperRef];
  if (abbreviationMatches) {
    for (const possibleName of abbreviationMatches) {
      const byAbbrev = await prisma.product.findFirst({
        where: { name: { contains: possibleName }, active: true },
        select: { id: true, name: true, sku: true }
      });
      if (byAbbrev) return byAbbrev;
    }
  }

  return null;
}

/**
 * Resolve a retailer reference to a retailer ID
 */
export async function resolveRetailerRef(ref: string): Promise<{
  id: string;
  name: string;
} | null> {
  // Apply any learned corrections first
  const correctedRef = applyRetailerCorrection(ref);
  
  // Try name contains match
  const byName = await prisma.retailer.findFirst({
    where: { name: { contains: correctedRef }, active: true },
    select: { id: true, name: true }
  });
  if (byName) return byName;

  return null;
}

/**
 * Resolve a batch reference to a batch ID
 */
export async function resolveBatchRef(ref: string): Promise<{
  id: string;
  batchCode: string;
  productId: string;
  productName: string;
} | null> {
  // Try exact batch code match
  const batch = await prisma.batch.findFirst({
    where: { batchCode: ref.toUpperCase() },
    select: { id: true, batchCode: true, productId: true, product: { select: { name: true } } }
  });
  if (batch) {
    return {
      id: batch.id,
      batchCode: batch.batchCode,
      productId: batch.productId,
      productName: batch.product.name
    };
  }

  // Try partial match
  const byPartial = await prisma.batch.findFirst({
    where: { batchCode: { contains: ref } },
    select: { id: true, batchCode: true, productId: true, product: { select: { name: true } } }
  });
  if (byPartial) {
    return {
      id: byPartial.id,
      batchCode: byPartial.batchCode,
      productId: byPartial.productId,
      productName: byPartial.product.name
    };
  }

  return null;
}

/**
 * Resolve a location reference to a location ID
 */
export async function resolveLocationRef(ref: string): Promise<{
  id: string;
  name: string;
} | null> {
  // Apply any learned corrections first
  const correctedRef = applyLocationCorrection(ref);
  
  // Try exact name match
  const byName = await prisma.location.findFirst({
    where: { name: correctedRef, active: true },
    select: { id: true, name: true }
  });
  if (byName) return byName;

  // Try partial name match
  const byPartial = await prisma.location.findFirst({
    where: { name: { contains: correctedRef }, active: true },
    select: { id: true, name: true }
  });
  if (byPartial) return byPartial;

  // Check abbreviations
  const upperRef = correctedRef.toUpperCase();
  const abbreviationMatches = LOCATION_ABBREVIATIONS[upperRef];
  if (abbreviationMatches) {
    for (const possibleName of abbreviationMatches) {
      const byAbbrev = await prisma.location.findFirst({
        where: { name: { contains: possibleName }, active: true },
        select: { id: true, name: true }
      });
      if (byAbbrev) return byAbbrev;
    }
  }

  // Try default receiving location
  if (correctedRef.toLowerCase().includes('default') || correctedRef.toLowerCase().includes('receiving')) {
    const defaultReceiving = await prisma.location.findFirst({
      where: { isDefaultReceiving: true, active: true },
      select: { id: true, name: true }
    });
    if (defaultReceiving) return defaultReceiving;
  }

  return null;
}

/**
 * Resolve a vendor reference to a vendor ID
 */
export async function resolveVendorRef(ref: string): Promise<{
  id: string;
  name: string;
} | null> {
  // Try name contains match
  const byName = await prisma.vendor.findFirst({
    where: { name: { contains: ref }, active: true },
    select: { id: true, name: true }
  });
  if (byName) return byName;

  return null;
}

/**
 * Find inventory by material, product, or batch reference
 */
export async function resolveInventoryRef(ref: string): Promise<{
  id: string;
  itemName: string;
  locationName: string;
  quantityOnHand: number;
} | null> {
  // Try material reference first
  const material = await resolveMaterialRef(ref);
  if (material) {
    const inv = await prisma.inventoryItem.findFirst({
      where: { materialId: material.id, status: 'AVAILABLE', quantityOnHand: { gt: 0 } },
      include: { location: true },
      orderBy: { expiryDate: 'asc' }
    });
    if (inv) {
      return {
        id: inv.id,
        itemName: material.name,
        locationName: inv.location.name,
        quantityOnHand: inv.quantityOnHand
      };
    }
  }

  // Try product reference
  const product = await resolveProductRef(ref);
  if (product) {
    const inv = await prisma.inventoryItem.findFirst({
      where: { productId: product.id, status: 'AVAILABLE', quantityOnHand: { gt: 0 } },
      include: { location: true },
      orderBy: { expiryDate: 'asc' }
    });
    if (inv) {
      return {
        id: inv.id,
        itemName: product.name,
        locationName: inv.location.name,
        quantityOnHand: inv.quantityOnHand
      };
    }
  }

  // Try direct inventory ID
  const directInv = await prisma.inventoryItem.findUnique({
    where: { id: ref },
    include: { location: true, product: true, material: true }
  });
  if (directInv) {
    return {
      id: directInv.id,
      itemName: directInv.product?.name || directInv.material?.name || 'Unknown',
      locationName: directInv.location.name,
      quantityOnHand: directInv.quantityOnHand
    };
  }

  return null;
}

// ========================================
// COMMAND INTERPRETATION
// ========================================

/**
 * Interpret a natural language command into a structured command
 */
export async function interpretCommand(
  inputText: string,
  userId?: string | null
): Promise<{ log: any; command: AICommandInterpretation }> {
  let rawResult;
  let command: AICommandInterpretation;

  try {
    // Call AI client to interpret
    rawResult = await interpretNaturalLanguageCommand(inputText);
  } catch (error) {
    if (error instanceof AIClientError) {
      // Log the failed attempt
      const validUserId = await validateUserId(userId);
      const log = await prisma.aICommandLog.create({
        data: {
          userId: validUserId,
          inputText,
          normalized: null,
          status: AICommandStatus.FAILED,
          aiResult: null,
          error: error.message,
        }
      });
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Unable to interpret command: ' + error.message,
        { logId: log.id }
      );
    }
    throw error;
  }

  // Map raw result to typed command
  try {
    command = await mapRawResultToCommand(rawResult);
  } catch (error: any) {
    const validUserId = await validateUserId(userId);
    const log = await prisma.aICommandLog.create({
      data: {
        userId: validUserId,
        inputText,
        normalized: rawResult.command,
        status: AICommandStatus.FAILED,
        aiResult: rawResult as any,
        error: error.message || 'Failed to map command',
      }
    });
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Invalid command structure: ' + (error.message || 'Unknown error'),
      { logId: log.id }
    );
  }

  // Resolve references where possible
  command = await resolveCommandReferences(command);

  // Create log entry
  const validUserId = await validateUserId(userId);
  const log = await prisma.aICommandLog.create({
    data: {
      userId: validUserId,
      inputText,
      normalized: command.command,
      status: AICommandStatus.PENDING,
      aiResult: rawResult as any,
      executedPayload: null,
    }
  });

  return { log, command };
}

/**
 * Map raw AI result to typed command
 */
async function mapRawResultToCommand(raw: { command: string; args: Record<string, any> }): Promise<AICommandInterpretation> {
  const cmd = raw.command.toUpperCase();
  const args = raw.args;

  switch (cmd) {
    case 'RECEIVE_MATERIAL':
      if (!args.materialRef || !args.quantity) {
        throw new Error('RECEIVE_MATERIAL requires materialRef and quantity');
      }
      return {
        command: 'RECEIVE_MATERIAL',
        args: {
          materialRef: args.materialRef,
          quantity: Number(args.quantity),
          unit: args.unit || 'UNIT',
          locationRef: args.locationRef,
          lotNumber: args.lotNumber,
          expiryDate: args.expiryDate,
          vendorRef: args.vendorRef,
          note: args.note,
        }
      };

    case 'MOVE_INVENTORY':
      if (!args.itemRef || !args.quantity || !args.toLocationRef) {
        throw new Error('MOVE_INVENTORY requires itemRef, quantity, and toLocationRef');
      }
      return {
        command: 'MOVE_INVENTORY',
        args: {
          itemRef: args.itemRef,
          quantity: Number(args.quantity),
          toLocationRef: args.toLocationRef,
          note: args.note,
        }
      };

    case 'ADJUST_INVENTORY':
      if (!args.itemRef || args.delta === undefined || !args.reason) {
        throw new Error('ADJUST_INVENTORY requires itemRef, delta, and reason');
      }
      return {
        command: 'ADJUST_INVENTORY',
        args: {
          itemRef: args.itemRef,
          delta: Number(args.delta),
          reason: args.reason,
        }
      };

    case 'CREATE_RETAILER_ORDER':
      if (!args.retailerRef || !args.items || !Array.isArray(args.items) || args.items.length === 0) {
        throw new Error('CREATE_RETAILER_ORDER requires retailerRef and items array');
      }
      return {
        command: 'CREATE_RETAILER_ORDER',
        args: {
          retailerRef: args.retailerRef,
          items: args.items.map((item: any) => ({
            productRef: item.productRef,
            quantity: Number(item.quantity),
          })),
          note: args.note,
        }
      };

    case 'COMPLETE_BATCH':
      if (!args.batchRef || args.yieldQuantity === undefined) {
        throw new Error('COMPLETE_BATCH requires batchRef and yieldQuantity');
      }
      return {
        command: 'COMPLETE_BATCH',
        args: {
          batchRef: args.batchRef,
          yieldQuantity: Number(args.yieldQuantity),
          lossQuantity: args.lossQuantity !== undefined ? Number(args.lossQuantity) : undefined,
          lossReason: args.lossReason,
        }
      };

    case 'CREATE_MATERIAL':
      if (!args.name) {
        throw new Error('CREATE_MATERIAL requires name');
      }
      return {
        command: 'CREATE_MATERIAL',
        args: {
          name: args.name,
          sku: args.sku,
          unit: args.unit,
          vendorRef: args.vendorRef,
          description: args.description,
        }
      };

    case 'GENERATE_INVOICE':
      if (!args.orderRef && !args.retailerRef) {
        throw new Error('GENERATE_INVOICE requires orderRef or retailerRef');
      }
      return {
        command: 'GENERATE_INVOICE',
        args: {
          orderRef: args.orderRef,
          retailerRef: args.retailerRef,
        }
      };

    case 'GENERATE_MANIFEST':
      if (!args.orderRef && !args.retailerRef) {
        throw new Error('GENERATE_MANIFEST requires orderRef or retailerRef');
      }
      return {
        command: 'GENERATE_MANIFEST',
        args: {
          orderRef: args.orderRef,
          retailerRef: args.retailerRef,
        }
      };

    default:
      throw new Error(`Unknown command type: ${cmd}`);
  }
}

/**
 * Resolve references in a command to actual database IDs
 */
export async function resolveCommandReferences(cmd: AICommandInterpretation): Promise<AICommandInterpretation> {
  switch (cmd.command) {
    case 'RECEIVE_MATERIAL': {
      const material = await resolveMaterialRef(cmd.args.materialRef);
      const location = cmd.args.locationRef 
        ? await resolveLocationRef(cmd.args.locationRef)
        : await prisma.location.findFirst({ where: { isDefaultReceiving: true, active: true }, select: { id: true, name: true } });
      const vendor = cmd.args.vendorRef ? await resolveVendorRef(cmd.args.vendorRef) : null;
      
      return {
        ...cmd,
        resolved: {
          materialId: material?.id,
          materialName: material?.name,
          locationId: location?.id,
          locationName: location?.name,
          vendorId: vendor?.id,
          vendorName: vendor?.name,
        }
      };
    }

    case 'MOVE_INVENTORY': {
      const inventory = await resolveInventoryRef(cmd.args.itemRef);
      const toLocation = await resolveLocationRef(cmd.args.toLocationRef);
      
      return {
        ...cmd,
        resolved: {
          inventoryId: inventory?.id,
          toLocationId: toLocation?.id,
          toLocationName: toLocation?.name,
        }
      };
    }

    case 'ADJUST_INVENTORY': {
      const inventory = await resolveInventoryRef(cmd.args.itemRef);
      
      return {
        ...cmd,
        resolved: {
          inventoryId: inventory?.id,
          currentQuantity: inventory?.quantityOnHand,
        }
      };
    }

    case 'CREATE_RETAILER_ORDER': {
      const retailer = await resolveRetailerRef(cmd.args.retailerRef);
      const resolvedItems = [];
      
      for (const item of cmd.args.items) {
        const product = await resolveProductRef(item.productRef);
        if (product) {
          resolvedItems.push({
            productId: product.id,
            productName: product.name,
            quantity: item.quantity,
          });
        }
      }
      
      return {
        ...cmd,
        resolved: {
          retailerId: retailer?.id,
          retailerName: retailer?.name,
          items: resolvedItems.length > 0 ? resolvedItems : undefined,
        }
      };
    }

    case 'COMPLETE_BATCH': {
      const batch = await resolveBatchRef(cmd.args.batchRef);
      
      return {
        ...cmd,
        resolved: {
          batchId: batch?.id,
          batchCode: batch?.batchCode,
          productName: batch?.productName,
        }
      };
    }

    case 'CREATE_MATERIAL': {
      const vendor = cmd.args.vendorRef ? await resolveVendorRef(cmd.args.vendorRef) : null;
      
      return {
        ...cmd,
        resolved: {
          vendorId: vendor?.id,
          vendorName: vendor?.name,
        }
      };
    }

    case 'GENERATE_INVOICE':
    case 'GENERATE_MANIFEST': {
      let order = null;
      
      // Try to resolve by order reference first
      if (cmd.args.orderRef) {
        order = await prisma.retailerOrder.findFirst({
          where: {
            OR: [
              { orderNumber: { contains: cmd.args.orderRef } },
              { id: cmd.args.orderRef }
            ]
          },
          include: { retailer: true }
        });
      }
      
      // If not found by order ref, try retailer ref (most recent shipped order)
      if (!order && cmd.args.retailerRef) {
        const retailer = await resolveRetailerRef(cmd.args.retailerRef);
        if (retailer) {
          order = await prisma.retailerOrder.findFirst({
            where: {
              retailerId: retailer.id,
              status: 'SHIPPED'
            },
            include: { retailer: true },
            orderBy: { shippedAt: 'desc' }
          });
        }
      }
      
      return {
        ...cmd,
        resolved: {
          orderId: order?.id,
          orderNumber: order?.orderNumber,
          retailerId: order?.retailerId,
          retailerName: order?.retailer?.name,
        }
      } as GenerateInvoiceCommand | GenerateManifestCommand;
    }

    default:
      return cmd;
  }
}

// ========================================
// COMMAND EXECUTION
// ========================================

/**
 * Execute an interpreted command
 */
export async function executeInterpretedCommand(
  interpreted: AICommandInterpretation,
  options: { userId?: string | null; logId?: string | null }
): Promise<AICommandExecutionResult> {
  const { userId, logId } = options;

  try {
    // Validate basic invariants
    validateCommand(interpreted);

    // Execute based on command type
    let result: AICommandExecutionResult;

    switch (interpreted.command) {
      case 'RECEIVE_MATERIAL':
        result = await executeReceiveMaterial(interpreted, userId);
        break;
      case 'MOVE_INVENTORY':
        result = await executeMoveInventory(interpreted, userId);
        break;
      case 'ADJUST_INVENTORY':
        result = await executeAdjustInventory(interpreted, userId);
        break;
      case 'CREATE_RETAILER_ORDER':
        result = await executeCreateRetailerOrder(interpreted, userId);
        break;
      case 'COMPLETE_BATCH':
        result = await executeCompleteBatch(interpreted, userId);
        break;
      case 'CREATE_MATERIAL':
        result = await executeCreateMaterial(interpreted, userId);
        break;
      case 'GENERATE_INVOICE':
        result = await executeGenerateInvoice(interpreted, userId);
        break;
      case 'GENERATE_MANIFEST':
        result = await executeGenerateManifest(interpreted, userId);
        break;
      default:
        throw new Error(`Unknown command: ${(interpreted as any).command}`);
    }

    // Update log on success
    if (logId) {
      await prisma.aICommandLog.update({
        where: { id: logId },
        data: {
          status: AICommandStatus.APPLIED,
          appliedAt: new Date(),
          executedPayload: interpreted as any,
        }
      });
    }

    // Log AI command execution
    await logAction({
      entityType: ActivityEntity.SYSTEM,
      entityId: logId || interpreted.command,
      action: 'ai_command_executed',
      userId: userId || undefined,
      summary: `AI command ${interpreted.command} executed successfully`,
      details: {
        command: interpreted,
        result,
      },
      tags: ['ai_command', getCommandTag(interpreted.command)],
    });

    return result;

  } catch (error: any) {
    // Update log on failure
    if (logId) {
      await prisma.aICommandLog.update({
        where: { id: logId },
        data: {
          status: AICommandStatus.FAILED,
          error: error.message || 'Unknown error',
          executedPayload: interpreted as any,
        }
      });
    }

    // Log failure
    await logAction({
      entityType: ActivityEntity.SYSTEM,
      entityId: logId || interpreted.command,
      action: 'ai_command_failed',
      userId: userId || undefined,
      summary: `AI command ${interpreted.command} failed: ${error.message}`,
      details: {
        command: interpreted,
        error: error.message,
      },
      tags: ['ai_command', 'error'],
    });

    return {
      success: false,
      message: error.message || 'Command execution failed',
      details: { error: error.message }
    };
  }
}

/**
 * Validate command invariants before execution
 */
function validateCommand(cmd: AICommandInterpretation): void {
  switch (cmd.command) {
    case 'RECEIVE_MATERIAL':
      if (!cmd.resolved?.materialId) {
        throw new Error(`Material not found: "${cmd.args.materialRef}"`);
      }
      if (!cmd.resolved?.locationId) {
        throw new Error(`Location not found: "${cmd.args.locationRef || 'default'}"`);
      }
      if (cmd.args.quantity <= 0) {
        throw new Error('Quantity must be greater than 0');
      }
      break;

    case 'MOVE_INVENTORY':
      if (!cmd.resolved?.inventoryId) {
        throw new Error(`Inventory item not found: "${cmd.args.itemRef}"`);
      }
      if (!cmd.resolved?.toLocationId) {
        throw new Error(`Destination location not found: "${cmd.args.toLocationRef}"`);
      }
      if (cmd.args.quantity <= 0) {
        throw new Error('Quantity must be greater than 0');
      }
      break;

    case 'ADJUST_INVENTORY':
      if (!cmd.resolved?.inventoryId) {
        throw new Error(`Inventory item not found: "${cmd.args.itemRef}"`);
      }
      // Delta can be 0 if targetQuantity is specified (will be calculated during execution)
      if (cmd.args.delta === 0 && cmd.args.targetQuantity === undefined) {
        throw new Error('Delta cannot be 0');
      }
      break;

    case 'CREATE_RETAILER_ORDER':
      if (!cmd.resolved?.retailerId) {
        throw new Error(`Retailer not found: "${cmd.args.retailerRef}"`);
      }
      if (!cmd.resolved?.items || cmd.resolved.items.length === 0) {
        throw new Error('No valid products found in order');
      }
      break;

    case 'COMPLETE_BATCH':
      if (!cmd.resolved?.batchId) {
        throw new Error(`Batch not found: "${cmd.args.batchRef}"`);
      }
      if (cmd.args.yieldQuantity < 0) {
        throw new Error('Yield quantity cannot be negative');
      }
      break;

    case 'CREATE_MATERIAL':
      if (!cmd.args.name) {
        throw new Error('Material name is required');
      }
      break;

    case 'GENERATE_INVOICE':
      if (!cmd.resolved?.orderId) {
        throw new Error(`Order not found: "${cmd.args.orderRef || cmd.args.retailerRef}"`);
      }
      break;

    case 'GENERATE_MANIFEST':
      if (!cmd.resolved?.orderId) {
        throw new Error(`Order not found: "${cmd.args.orderRef || cmd.args.retailerRef}"`);
      }
      break;
  }
}

/**
 * Get activity tag for command type
 */
function getCommandTag(command: string): string {
  const tagMap: Record<string, string> = {
    'RECEIVE_MATERIAL': 'inventory',
    'MOVE_INVENTORY': 'inventory',
    'ADJUST_INVENTORY': 'inventory',
    'CREATE_RETAILER_ORDER': 'order',
    'COMPLETE_BATCH': 'production',
    'CREATE_MATERIAL': 'material',
    'GENERATE_INVOICE': 'invoice',
    'GENERATE_MANIFEST': 'shipping',
  };
  return tagMap[command] || 'other';
}

// ========================================
// COMMAND EXECUTION HANDLERS
// ========================================

async function executeReceiveMaterial(
  cmd: ReceiveMaterialCommand,
  userId?: string | null
): Promise<AICommandExecutionResult> {
  const inventoryId = await receiveMaterials({
    materialId: cmd.resolved!.materialId!,
    quantity: cmd.args.quantity,
    locationId: cmd.resolved!.locationId!,
    lotNumber: cmd.args.lotNumber,
    expiryDate: cmd.args.expiryDate ? parseExpiryDate(cmd.args.expiryDate) : undefined,
    userId: userId || 'system',
  });

  return {
    success: true,
    message: `Received ${cmd.args.quantity} ${cmd.resolved?.materialName || cmd.args.materialRef} to ${cmd.resolved?.locationName || 'inventory'}`,
    details: { inventoryId }
  };
}

async function executeMoveInventory(
  cmd: MoveInventoryCommand,
  userId?: string | null
): Promise<AICommandExecutionResult> {
  await moveInventory({
    inventoryId: cmd.resolved!.inventoryId!,
    toLocationId: cmd.resolved!.toLocationId!,
    quantity: cmd.args.quantity,
    reason: cmd.args.note || 'AI command',
    userId: userId || 'system',
  });

  return {
    success: true,
    message: `Moved ${cmd.args.quantity} to ${cmd.resolved?.toLocationName || cmd.args.toLocationRef}`,
    details: {}
  };
}

async function executeAdjustInventory(
  cmd: AdjustInventoryCommand,
  userId?: string | null
): Promise<AICommandExecutionResult> {
  // Calculate delta if targetQuantity is specified
  let delta = cmd.args.delta;
  if (cmd.args.targetQuantity !== undefined && cmd.resolved?.currentQuantity !== undefined) {
    delta = cmd.args.targetQuantity - cmd.resolved.currentQuantity;
  }

  // If delta is 0, no adjustment needed
  if (delta === 0) {
    return {
      success: true,
      message: `Inventory already at target quantity (${cmd.args.targetQuantity})`,
      details: { noChangeNeeded: true }
    };
  }

  await adjustInventory({
    inventoryId: cmd.resolved!.inventoryId!,
    deltaQuantity: delta,
    reason: cmd.args.reason,
    userId: userId || 'system',
  });

  const direction = delta > 0 ? 'increased' : 'decreased';
  const targetInfo = cmd.args.targetQuantity !== undefined 
    ? ` to ${cmd.args.targetQuantity}` 
    : '';
  return {
    success: true,
    message: `Inventory ${direction} by ${Math.abs(delta)}${targetInfo}: ${cmd.args.reason}`,
    details: { delta, targetQuantity: cmd.args.targetQuantity }
  };
}

async function executeCreateRetailerOrder(
  cmd: CreateRetailerOrderCommand,
  userId?: string | null
): Promise<AICommandExecutionResult> {
  const orderId = await createOrder({
    retailerId: cmd.resolved!.retailerId!,
    createdByUserId: userId || 'system',
    lineItems: cmd.resolved!.items!.map(item => ({
      productId: item.productId,
      quantityOrdered: item.quantity,
    })),
  });

  return {
    success: true,
    message: `Created order for ${cmd.resolved?.retailerName || cmd.args.retailerRef} with ${cmd.resolved!.items!.length} item(s)`,
    details: { orderId }
  };
}

async function executeCompleteBatch(
  cmd: CompleteBatchCommand,
  userId?: string | null
): Promise<AICommandExecutionResult> {
  // Get batch to find product and location
  const batch = await prisma.batch.findUnique({
    where: { id: cmd.resolved!.batchId! },
    include: { product: true }
  });

  if (!batch) {
    throw new Error('Batch not found');
  }

  // Find default finished goods location
  const fgLocation = await prisma.location.findFirst({
    where: { 
      OR: [
        { name: { contains: 'Finished', mode: 'insensitive' } },
        { isDefaultShipping: true }
      ],
      active: true 
    }
  });

  if (!fgLocation) {
    throw new Error('No finished goods location found');
  }

  await completeBatch({
    batchId: cmd.resolved!.batchId!,
    actualQuantity: cmd.args.yieldQuantity,
    locationId: fgLocation.id,
    expectedYield: cmd.args.yieldQuantity + (cmd.args.lossQuantity || 0),
    lossQty: cmd.args.lossQuantity,
    lossReason: cmd.args.lossReason,
    userId: userId || 'system',
  });

  return {
    success: true,
    message: `Completed batch ${cmd.resolved?.batchCode || cmd.args.batchRef} with yield of ${cmd.args.yieldQuantity}`,
    details: { batchId: cmd.resolved!.batchId }
  };
}

async function executeCreateMaterial(
  cmd: CreateMaterialCommand,
  userId?: string | null
): Promise<AICommandExecutionResult> {
  // Generate SKU if not provided
  const sku = cmd.args.sku || generateMaterialSku(cmd.args.name);

  const material = await createMaterial({
    name: cmd.args.name,
    sku,
    unitOfMeasure: cmd.args.unit || 'GRAM',
    description: cmd.args.description,
  }, userId || undefined);

  return {
    success: true,
    message: `Created material "${cmd.args.name}" with SKU ${sku}`,
    details: { materialId: material.id, sku }
  };
}

async function executeGenerateInvoice(
  cmd: GenerateInvoiceCommand,
  userId?: string | null
): Promise<AICommandExecutionResult> {
  const orderId = cmd.resolved!.orderId!;
  
  // Check if invoice already exists
  const existingInvoice = await getInvoiceByOrderId(orderId);
  if (existingInvoice) {
    return {
      success: true,
      message: `Invoice ${existingInvoice.invoiceNo} already exists for order ${cmd.resolved?.orderNumber}`,
      details: { invoiceId: existingInvoice.id, invoiceNo: existingInvoice.invoiceNo }
    };
  }

  // Generate the invoice
  const invoiceId = await generateInvoice({
    orderId,
    userId: userId || undefined
  });

  // Fetch the created invoice to get the invoice number
  const invoice = await getInvoiceByOrderId(orderId);

  return {
    success: true,
    message: `Generated invoice ${invoice?.invoiceNo || invoiceId} for order ${cmd.resolved?.orderNumber || orderId}`,
    details: { 
      invoiceId, 
      invoiceNo: invoice?.invoiceNo,
      orderNumber: cmd.resolved?.orderNumber,
      retailerName: cmd.resolved?.retailerName,
      downloadUrl: `/api/invoices/${invoiceId}/pdf`
    }
  };
}

async function executeGenerateManifest(
  cmd: GenerateManifestCommand,
  userId?: string | null
): Promise<AICommandExecutionResult> {
  const orderId = cmd.resolved!.orderId!;
  
  // The manifest can be generated anytime, no creation needed
  // Just return the download URL
  return {
    success: true,
    message: `Packing slip ready for order ${cmd.resolved?.orderNumber}`,
    details: { 
      orderId,
      orderNumber: cmd.resolved?.orderNumber,
      retailerName: cmd.resolved?.retailerName,
      downloadUrl: `/api/orders/${orderId}/manifest`
    }
  };
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function parseExpiryDate(dateStr: string): Date | undefined {
  // Try ISO format
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try MM/YY or MM/YYYY
  const shortMatch = dateStr.match(/^(\d{1,2})\/(\d{2,4})$/);
  if (shortMatch) {
    const month = parseInt(shortMatch[1], 10) - 1;
    let year = parseInt(shortMatch[2], 10);
    if (year < 100) {
      year += 2000;
    }
    return new Date(year, month + 1, 0); // Last day of the month
  }

  return undefined;
}

function generateMaterialSku(name: string): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 6);
  const suffix = Date.now().toString(36).toUpperCase().substring(-4);
  return `${prefix}-${suffix}`;
}

// ========================================
// QUERY FUNCTIONS
// ========================================

/**
 * Get recent AI command logs
 */
export async function getRecentCommandLogs(limit = 50) {
  return prisma.aICommandLog.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Get AI command log by ID
 */
export async function getCommandLog(id: string) {
  return prisma.aICommandLog.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } }
    },
  });
}

// ========================================
// CORRECTION HANDLING
// ========================================

/**
 * Execute a corrected command and record the corrections
 */
export async function executeCorrectedCommand(
  originalCommand: AICommandInterpretation,
  correctedCommand: AICommandInterpretation,
  options: { userId?: string | null; logId?: string | null }
): Promise<AICommandExecutionResult> {
  const { userId, logId } = options;

  // Record corrections for future use
  recordCommandCorrections(originalCommand, correctedCommand);

  // Resolve the corrected command references
  const resolvedCommand = await resolveCommandReferences(correctedCommand);

  // Execute the resolved command
  const result = await executeInterpretedCommand(resolvedCommand, { userId, logId });

  // Update the log with the corrected command
  if (logId) {
    await prisma.aICommandLog.update({
      where: { id: logId },
      data: {
        correctedCommand: correctedCommand as any,
      }
    });
  }

  return result;
}

/**
 * Record corrections from original to corrected command
 */
function recordCommandCorrections(
  original: AICommandInterpretation,
  corrected: AICommandInterpretation
): void {
  // Only record if commands are the same type
  if (original.command !== corrected.command) return;

  switch (original.command) {
    case 'RECEIVE_MATERIAL': {
      const origArgs = original.args;
      const corrArgs = (corrected as ReceiveMaterialCommand).args;
      if (origArgs.materialRef !== corrArgs.materialRef) {
        recordCorrection('material', origArgs.materialRef, corrArgs.materialRef);
      }
      if (origArgs.locationRef && corrArgs.locationRef && origArgs.locationRef !== corrArgs.locationRef) {
        recordCorrection('location', origArgs.locationRef, corrArgs.locationRef);
      }
      break;
    }

    case 'MOVE_INVENTORY': {
      const origArgs = original.args;
      const corrArgs = (corrected as MoveInventoryCommand).args;
      if (origArgs.toLocationRef !== corrArgs.toLocationRef) {
        recordCorrection('location', origArgs.toLocationRef, corrArgs.toLocationRef);
      }
      break;
    }

    case 'CREATE_RETAILER_ORDER': {
      const origArgs = original.args;
      const corrArgs = (corrected as CreateRetailerOrderCommand).args;
      if (origArgs.retailerRef !== corrArgs.retailerRef) {
        recordCorrection('retailer', origArgs.retailerRef, corrArgs.retailerRef);
      }
      // Record product corrections
      if (origArgs.items && corrArgs.items) {
        for (let i = 0; i < Math.min(origArgs.items.length, corrArgs.items.length); i++) {
          if (origArgs.items[i].productRef !== corrArgs.items[i].productRef) {
            recordCorrection('product', origArgs.items[i].productRef, corrArgs.items[i].productRef);
          }
        }
      }
      break;
    }

    case 'COMPLETE_BATCH':
    case 'ADJUST_INVENTORY':
    case 'CREATE_MATERIAL':
      // These don't typically need reference corrections
      break;
  }
}

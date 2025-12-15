// Validation utilities using Zod

import { z } from 'zod';
import { MaterialCategory } from '@/lib/types/enums';

// Common schemas
export const idSchema = z.string().min(1, 'ID is required');

export const emailSchema = z.string().email('Invalid email address');

export const positiveNumber = z.number().positive('Must be a positive number');

export const nonNegativeNumber = z.number().nonnegative('Must be zero or positive');

export const dateSchema = z.union([z.date(), z.string().datetime()]);

// Entity schemas
export const createProductSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku: z.string().min(1, 'SKU is required'),
  unitOfMeasure: z.string().min(1, 'Unit of measure is required'),
  defaultBatchSize: z.number().positive().optional(),
  leadTimeDays: z.number().nonnegative().default(0),
  reorderPoint: z.number().nonnegative().default(0),
  active: z.boolean().default(true)
});

export const updateProductSchema = createProductSchema.partial();

export const createMaterialSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku: z.string().min(1, 'SKU is required'),
  unitOfMeasure: z.string().min(1, 'Unit of measure is required'),
  category: z
    .string()
    .min(1, 'Category is required')
    .refine((v) => Object.values(MaterialCategory).includes(v as MaterialCategory), 'Invalid category'),
  currentStockQty: nonNegativeNumber.default(0),
  reorderPoint: nonNegativeNumber.default(0),
  reorderQuantity: nonNegativeNumber.default(0),
  leadTimeDays: z.number().nonnegative().default(0),
  preferredVendorId: z.string().optional(),
  active: z.boolean().default(true)
});

export const createVendorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contactEmail: emailSchema.optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  paymentTerms: z.string().optional(),
  defaultLeadTimeDays: z.number().nonnegative().default(0),
  notes: z.string().optional()
});

export const createLocationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  isDefaultReceiving: z.boolean().default(false),
  isDefaultShipping: z.boolean().default(false),
  active: z.boolean().default(true)
});

export const createOrderSchema = z.object({
  retailerId: idSchema,
  requestedShipDate: dateSchema.optional(),
  lineItems: z.array(z.object({
    productId: idSchema,
    quantityOrdered: positiveNumber
  })).min(1, 'At least one line item is required')
});

export const createProductionOrderSchema = z.object({
  productId: idSchema,
  quantityToMake: positiveNumber,
  batchSize: positiveNumber.optional(),
  scheduledDate: dateSchema.optional(),
  dueDate: dateSchema.optional(),
  workCenterId: idSchema.optional(),
  templateId: idSchema.optional(),
  linkedRetailerOrderIds: z.array(idSchema).optional()
});

export const updateProductionOrderSchema = z.object({
  scheduledDate: dateSchema.optional(),
  dueDate: dateSchema.optional(),
  workCenterId: idSchema.optional().nullable(),
  templateId: idSchema.optional().nullable()
});

export const startProductionOrderSchema = z.object({
  orderId: idSchema
});

export const completeProductionOrderSchema = z.object({
  orderId: idSchema
});

export const blockProductionOrderSchema = z.object({
  orderId: idSchema,
  reason: z.string().min(1, 'Reason is required')
});

export const issueMaterialsSchema = z.object({
  materials: z.array(z.object({
    materialId: idSchema,
    quantity: positiveNumber
  })).min(1, 'At least one material is required')
});

export const createBatchSchema = z.object({
  productId: idSchema,
  plannedQuantity: positiveNumber,
  productionOrderId: idSchema.optional(),
  expectedYield: positiveNumber.optional(),
  manufactureDate: dateSchema.optional(),
  expirationDate: dateSchema.optional(),
  notes: z.string().optional()
});

export const updateBatchSchema = z.object({
  plannedQuantity: positiveNumber.optional(),
  expectedYield: nonNegativeNumber.optional(),
  actualYield: nonNegativeNumber.optional(),
  lossQty: nonNegativeNumber.optional(),
  lossReason: z.string().optional(),
  manufactureDate: dateSchema.optional(),
  expirationDate: dateSchema.optional(),
  productionDate: dateSchema.optional(),
  notes: z.string().optional()
});

export const completeBatchSchema = z.object({
  actualQuantity: positiveNumber,
  locationId: idSchema,
  productionDate: dateSchema.optional(),
  manufactureDate: dateSchema.optional(),
  expirationDate: dateSchema.optional(),
  expectedYield: positiveNumber.optional(),
  lossQty: nonNegativeNumber.optional(),
  lossReason: z.string().optional(),
  qcRequired: z.boolean().optional(),
  unitCost: positiveNumber.optional(),
  notes: z.string().optional()
});

// QC Status values
export const qcStatusValues = ['NOT_REQUIRED', 'PENDING', 'HOLD', 'PASSED', 'FAILED'] as const;

export const setBatchQCStatusSchema = z.object({
  qcStatus: z.enum(qcStatusValues),
  notes: z.string().optional()
});

export const adjustInventorySchema = z.object({
  inventoryId: idSchema,
  deltaQuantity: z.number(),
  reason: z.string().min(1, 'Reason is required')
});

// Inventory adjustment system (Phase 4.2)
export const inventoryAdjustmentTypeValues = [
  'PRODUCTION_COMPLETE',
  'PRODUCTION_SCRAP',
  'MANUAL_CORRECTION',
  'RECEIVING',
  'CONSUMPTION',
] as const;

export const inventoryAdjustmentRelatedEntityTypeValues = [
  'PRODUCT',
  'MATERIAL',
  'BATCH',
  'ORDER',
  'PRODUCTION_ORDER',
  'PURCHASE_ORDER',
  'VENDOR',
  'INVENTORY',
  'WORK_CENTER',
  'INVOICE',
  'LABEL',
  'SYSTEM',
  // UI-only value (mapped server-side)
  'QR_TOKEN',
] as const;

export const createInventoryAdjustmentSchema = z.object({
  deltaQty: z.number().int().refine((n) => n !== 0, 'Quantity cannot be 0'),
  reason: z.string().min(1, 'Reason is required'),
  adjustmentType: z.enum(inventoryAdjustmentTypeValues),
  relatedEntityType: z.enum(inventoryAdjustmentRelatedEntityTypeValues).optional(),
  relatedEntityId: z.string().min(1).optional(),
});

export const moveInventorySchema = z.object({
  inventoryId: idSchema,
  toLocationId: idSchema,
  quantity: positiveNumber,
  reason: z.string().optional()
});

export const createPurchaseOrderSchema = z.object({
  vendorId: idSchema,
  expectedDeliveryDate: dateSchema.optional(),
  lineItems: z.array(z.object({
    materialId: idSchema,
    quantityOrdered: positiveNumber,
    unitCost: positiveNumber.optional()
  })).min(1, 'At least one line item is required')
});

export const receivePurchaseOrderSchema = z.object({
  lineReceipts: z.array(z.object({
    lineItemId: idSchema,
    quantityReceived: positiveNumber,
    lotNumber: z.string().optional(),
    expiryDate: dateSchema.optional(),
    locationId: idSchema.optional()
  })).min(1, 'At least one receipt is required')
});

// ========================================
// INVENTORY SCHEMAS
// ========================================

export const reserveInventorySchema = z.object({
  inventoryId: idSchema,
  quantity: positiveNumber,
  context: z.string().min(1, 'Context is required'),
  reference: z.string().optional()
});

export const releaseInventorySchema = z.object({
  inventoryId: idSchema,
  quantity: positiveNumber,
  context: z.string().min(1, 'Context is required'),
  reference: z.string().optional()
});

export const inventoryListFilterSchema = z.object({
  type: z.enum(['PRODUCT', 'MATERIAL']).optional(),
  locationId: idSchema.optional(),
  productId: idSchema.optional(),
  materialId: idSchema.optional(),
  batchId: idSchema.optional(),
  status: z.enum(['AVAILABLE', 'RESERVED', 'QUARANTINED', 'DAMAGED', 'SCRAPPED']).optional(),
  search: z.string().optional(),
  hasExpiry: z.boolean().optional(),
  expiringWithinDays: z.number().positive().optional(),
  limit: z.number().positive().max(200).optional(),
  offset: z.number().nonnegative().optional()
});

// ========================================
// WORK CENTER SCHEMAS
// ========================================

export const createWorkCenterSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional()
});

export const updateWorkCenterSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  active: z.boolean().optional()
});

// ========================================
// PRODUCTION TEMPLATE SCHEMAS
// ========================================

export const createProductionTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  productId: idSchema,
  defaultBatchSize: positiveNumber,
  instructions: z.string().optional()
});

export const updateProductionTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  defaultBatchSize: positiveNumber.optional(),
  instructions: z.string().optional(),
  active: z.boolean().optional()
});

// ========================================
// LABOR TRACKING SCHEMAS
// ========================================

export const addLaborEntrySchema = z.object({
  userId: idSchema,
  minutes: z.number().positive('Minutes must be positive'),
  role: z.string().optional(),
  notes: z.string().optional()
});

// ========================================
// LABEL TEMPLATE SCHEMAS
// ========================================

export const labelEntityTypeValues = ['PRODUCT', 'BATCH', 'INVENTORY', 'CUSTOM'] as const;

export const createLabelTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  entityType: z.enum(labelEntityTypeValues)
});

export const updateLabelTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required')
});

export const createLabelVersionSchema = z.object({
  version: z.string().min(1, 'Version is required').regex(
    /^[0-9]+\.[0-9]+(\.[0-9]+)?$/,
    'Version must be in format X.Y or X.Y.Z (e.g., 1.0, 2.1.3)'
  ),
  qrTemplate: z.string().optional(),
  notes: z.string().optional()
});

export const renderLabelSchema = z.object({
  versionId: idSchema.optional(),
  entityType: z.enum(labelEntityTypeValues).optional(),
  entityId: idSchema,
  quantity: z.number().positive().max(100, 'Maximum 100 labels at once').default(1)
});

export const qrPayloadSchema = z.object({
  type: z.enum(['PRODUCT', 'BATCH', 'INVENTORY']),
  id: z.string().min(1),
  code: z.string().min(1),
  url: z.string().url()
});


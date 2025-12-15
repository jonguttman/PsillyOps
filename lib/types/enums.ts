// CANONICAL ENUMS - SINGLE SOURCE OF TRUTH
// These must match exactly with Prisma schema enums

export enum UserRole {
  ADMIN = 'ADMIN',
  PRODUCTION = 'PRODUCTION',
  WAREHOUSE = 'WAREHOUSE',
  REP = 'REP'
}

export enum MaterialCategory {
  ACTIVE_INGREDIENT = 'Active Ingredient',
  SECONDARY_INGREDIENT = 'Secondary Ingredient',

  CAPSULES = 'Capsules',
  STRAWS_STICKS = 'Straws / Sticks',
  POWDERS_FILLERS = 'Powders & Fillers',

  PRIMARY_PACKAGING = 'Primary Packaging',
  SECONDARY_PACKAGING = 'Secondary Packaging',

  SEALS_SECURITY = 'Seals & Security',

  LABELS = 'Labels',
  PAPER_PRINT = 'Paper & Print Materials',

  SHIPPING = 'Shipping Materials',

  PRODUCTION_SUPPLIES = 'Production Supplies',
  EQUIPMENT = 'Equipment',
}

export enum OrderStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  IN_FULFILLMENT = 'IN_FULFILLMENT',
  SHIPPED = 'SHIPPED',
  CANCELLED = 'CANCELLED'
}

export enum ProductionStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum BatchStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  QC_HOLD = 'QC_HOLD',
  RELEASED = 'RELEASED',
  EXHAUSTED = 'EXHAUSTED',
  CANCELLED = 'CANCELLED'
}

export enum InventoryType {
  PRODUCT = 'PRODUCT',
  MATERIAL = 'MATERIAL'
}

export enum InventoryStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  DAMAGED = 'DAMAGED',
  SCRAPPED = 'SCRAPPED'
}

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED'
}

export enum ActivityEntity {
  PRODUCT = 'PRODUCT',
  MATERIAL = 'MATERIAL',
  BATCH = 'BATCH',
  ORDER = 'ORDER',
  PRODUCTION_ORDER = 'PRODUCTION_ORDER',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  VENDOR = 'VENDOR',
  INVENTORY = 'INVENTORY',
  WORK_CENTER = 'WORK_CENTER',
  INVOICE = 'INVOICE',
  LABEL = 'LABEL',
  SYSTEM = 'SYSTEM'
}

// AI Command Status values
export enum AICommandStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  APPLIED = 'APPLIED',
  FAILED = 'FAILED'
}

// AI Document Import Status values
export enum AIDocumentStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  PARSED = 'PARSED',
  APPLIED = 'APPLIED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED'
}

// QR Token Status values
export enum QRTokenStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED'
}

// Print Job Status values
export enum PrintJobStatus {
  CREATED = 'CREATED',
  PAPER_USED = 'PAPER_USED',
  VOIDED = 'VOIDED'
}


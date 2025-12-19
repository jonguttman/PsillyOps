import { UserRole } from '@/lib/types/enums';

export interface TooltipData {
  id: string;
  title: string;
  content: string;
  helpLink?: string;
  roles: UserRole[];
  examples?: string[];
}

/**
 * Static tooltip content registry
 * Role-filtered at render time, no async fetching
 */
export const TOOLTIPS: Record<string, TooltipData> = {
  // ============================================
  // AI COMMANDS
  // ============================================
  'ai-command-input': {
    id: 'ai-command-input',
    title: 'AI Command Input',
    content: 'Use natural language to perform operations. The AI understands inventory movements, production updates, and document generation.',
    helpLink: '/help#ai-commands',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE, UserRole.REP],
    examples: [
      'Received 500g PE from Mushroom Supply Co',
      'Start production for Golden Teacher',
      'Move batch B-102 to finished goods',
      'Generate invoice for ORD-2024-12-001'
    ]
  },

  // ============================================
  // ORDERS & INVOICING
  // ============================================
  'generate-invoice': {
    id: 'generate-invoice',
    title: 'Generate Invoice',
    content: 'Creates a PDF invoice with wholesale prices snapshotted at order creation. Prices reflect the wholesale rate at time of order, not current prices.',
    helpLink: '/help#wholesale-pricing-invoicing',
    roles: [UserRole.ADMIN],
    examples: []
  },

  'download-manifest': {
    id: 'download-manifest',
    title: 'Packing Slip / Manifest',
    content: 'Downloads a printable packing slip listing all items in the order. Use this to verify shipments before dispatch.',
    helpLink: '/help#wholesale-pricing-invoicing',
    roles: [UserRole.ADMIN, UserRole.WAREHOUSE],
    examples: []
  },

  'order-status-draft': {
    id: 'order-status-draft',
    title: 'Draft Order',
    content: 'Order is being prepared and can still be modified. Submit when ready for processing.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE, UserRole.REP]
  },

  'order-status-submitted': {
    id: 'order-status-submitted',
    title: 'Submitted Order',
    content: 'Order has been submitted for processing. Awaiting confirmation and inventory allocation.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE, UserRole.REP]
  },

  'order-status-shipped': {
    id: 'order-status-shipped',
    title: 'Shipped Order',
    content: 'Order has been dispatched. An invoice can now be generated if not already created.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE, UserRole.REP]
  },

  // ============================================
  // QR CODES
  // ============================================
  'view-qr-code': {
    id: 'view-qr-code',
    title: 'Material QR Code',
    content: 'Each material has a unique QR code for quick mobile access. Scan to view material details, vendor info, and inventory levels.',
    helpLink: '/help#qr-codes',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'qr-download': {
    id: 'qr-download',
    title: 'Download QR Code',
    content: 'Download the QR code as a PNG image. Print and attach to material bins or storage locations for quick identification.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'qr-print': {
    id: 'qr-print',
    title: 'Print QR Code',
    content: 'Opens a print-friendly view of the QR code. Best printed on label stock for warehouse use.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  // ============================================
  // PRODUCTION
  // ============================================
  'production-status-pending': {
    id: 'production-status-pending',
    title: 'Pending Production',
    content: 'Production order created but not yet started. Materials need to be allocated before starting.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'production-status-in-progress': {
    id: 'production-status-in-progress',
    title: 'In Progress',
    content: 'Production is actively running. Materials have been issued and the batch is being manufactured.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'production-status-completed': {
    id: 'production-status-completed',
    title: 'Completed Production',
    content: 'Production finished successfully. Output has been added to inventory and is awaiting QC.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'batch-qc-hold': {
    id: 'batch-qc-hold',
    title: 'QC Hold',
    content: 'Batch is on hold pending quality control review. Cannot be shipped or used in orders until released.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'batch-qc-passed': {
    id: 'batch-qc-passed',
    title: 'QC Passed',
    content: 'Batch has passed quality control inspection and is approved for sale or distribution.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'batch-qc-failed': {
    id: 'batch-qc-failed',
    title: 'QC Failed',
    content: 'Batch failed quality control. Review rejection reason and determine if rework is possible or if batch must be scrapped.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  // ============================================
  // INVENTORY
  // ============================================
  'inventory-status-available': {
    id: 'inventory-status-available',
    title: 'Available Inventory',
    content: 'Items are in stock and can be used for production or orders. No holds or reservations.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'inventory-status-reserved': {
    id: 'inventory-status-reserved',
    title: 'Reserved Inventory',
    content: 'Items are reserved for a specific order or production run. Not available for other allocations.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'inventory-status-quarantined': {
    id: 'inventory-status-quarantined',
    title: 'Quarantined Inventory',
    content: 'Items are isolated pending investigation. May be quality issue, damage, or regulatory hold.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'inventory-movement-receive': {
    id: 'inventory-movement-receive',
    title: 'Receive Movement',
    content: 'Items received into inventory from a purchase order or return. Increases on-hand quantity.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'inventory-movement-consume': {
    id: 'inventory-movement-consume',
    title: 'Consume Movement',
    content: 'Items consumed during production. Reduces on-hand quantity and links to production order.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'inventory-movement-adjust': {
    id: 'inventory-movement-adjust',
    title: 'Adjustment',
    content: 'Manual adjustment to inventory quantity. Used for cycle counts, corrections, or write-offs.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  },

  'inventory-expiry-warning': {
    id: 'inventory-expiry-warning',
    title: 'Expiry Warning',
    content: 'This item is expiring soon. Use FIFO (First In, First Out) to consume older inventory first.',
    roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE]
  }
};

/**
 * Get tooltip by ID
 * Returns undefined if not found
 */
export function getTooltip(id: string): TooltipData | undefined {
  return TOOLTIPS[id];
}

/**
 * Check if user role has access to tooltip
 */
export function canAccessTooltip(tooltip: TooltipData, userRole: UserRole): boolean {
  return tooltip.roles.includes(userRole);
}






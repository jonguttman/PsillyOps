'use client';

import TooltipWrapper from './TooltipWrapper';

interface StatusBadgeProps {
  status: string;
  tooltipId?: string;
  userRole?: string;
  className?: string;
}

// Status type definitions with colors
const STATUS_CONFIGS: Record<string, { color: string; label?: string }> = {
  // Production statuses
  PENDING: { color: 'bg-gray-100 text-gray-800' },
  IN_PROGRESS: { color: 'bg-blue-100 text-blue-800', label: 'In Progress' },
  COMPLETED: { color: 'bg-green-100 text-green-800' },
  CANCELLED: { color: 'bg-red-100 text-red-800' },
  
  // Order statuses
  DRAFT: { color: 'bg-gray-100 text-gray-800' },
  SUBMITTED: { color: 'bg-yellow-100 text-yellow-800' },
  APPROVED: { color: 'bg-blue-100 text-blue-800' },
  IN_FULFILLMENT: { color: 'bg-purple-100 text-purple-800', label: 'In Fulfillment' },
  SHIPPED: { color: 'bg-green-100 text-green-800' },
  
  // Inventory statuses
  AVAILABLE: { color: 'bg-green-100 text-green-800' },
  RESERVED: { color: 'bg-yellow-100 text-yellow-800' },
  QUARANTINED: { color: 'bg-orange-100 text-orange-800' },
  DAMAGED: { color: 'bg-red-100 text-red-800' },
  SCRAPPED: { color: 'bg-gray-100 text-gray-800' },
  
  // QC statuses
  HOLD: { color: 'bg-yellow-100 text-yellow-800' },
  PASSED: { color: 'bg-green-100 text-green-800' },
  FAILED: { color: 'bg-red-100 text-red-800' },
  
  // Movement types
  RECEIVE: { color: 'bg-purple-100 text-purple-800' },
  CONSUME: { color: 'bg-red-100 text-red-800' },
  ADJUST: { color: 'bg-gray-100 text-gray-800' },
  MOVE: { color: 'bg-blue-100 text-blue-800' },
  PRODUCE: { color: 'bg-green-100 text-green-800' },
  RETURN: { color: 'bg-orange-100 text-orange-800' },
  RELEASE: { color: 'bg-teal-100 text-teal-800' },
};

// Map status to tooltip IDs
const STATUS_TOOLTIP_MAP: Record<string, string> = {
  // Production
  PENDING: 'production-status-pending',
  IN_PROGRESS: 'production-status-in-progress',
  COMPLETED: 'production-status-completed',
  
  // Orders
  DRAFT: 'order-status-draft',
  SUBMITTED: 'order-status-submitted',
  SHIPPED: 'order-status-shipped',
  
  // Inventory
  AVAILABLE: 'inventory-status-available',
  RESERVED: 'inventory-status-reserved',
  QUARANTINED: 'inventory-status-quarantined',
  
  // QC
  HOLD: 'batch-qc-hold',
  PASSED: 'batch-qc-passed',
  FAILED: 'batch-qc-failed',
  
  // Movement
  RECEIVE: 'inventory-movement-receive',
  CONSUME: 'inventory-movement-consume',
  ADJUST: 'inventory-movement-adjust',
};

/**
 * StatusBadge - Reusable status badge component with optional tooltip
 * 
 * Usage:
 * ```tsx
 * <StatusBadge status="PENDING" userRole={userRole} />
 * <StatusBadge status="SHIPPED" tooltipId="order-status-shipped" userRole={userRole} />
 * ```
 */
export default function StatusBadge({ 
  status, 
  tooltipId, 
  userRole,
  className = ''
}: StatusBadgeProps) {
  const config = STATUS_CONFIGS[status] || { color: 'bg-gray-100 text-gray-800' };
  const displayLabel = config.label || status.replace(/_/g, ' ');
  
  // Resolve tooltip ID
  const resolvedTooltipId = tooltipId || STATUS_TOOLTIP_MAP[status];
  
  const badge = (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color} ${className}`}>
      {displayLabel}
    </span>
  );
  
  // If no tooltip, just return the badge
  if (!resolvedTooltipId) {
    return badge;
  }
  
  // Wrap with tooltip
  return (
    <TooltipWrapper tooltipId={resolvedTooltipId} userRole={userRole} position="top">
      {badge}
    </TooltipWrapper>
  );
}

/**
 * QCBadge - Specific badge for QC status with tooltip
 */
export function QCBadge({ status, userRole }: { status: string; userRole?: string }) {
  const tooltipMap: Record<string, string> = {
    HOLD: 'batch-qc-hold',
    PASSED: 'batch-qc-passed',
    FAILED: 'batch-qc-failed',
  };
  
  return (
    <StatusBadge 
      status={status} 
      tooltipId={tooltipMap[status]} 
      userRole={userRole} 
    />
  );
}

/**
 * MovementTypeBadge - Specific badge for inventory movement types
 */
export function MovementTypeBadge({ type, userRole }: { type: string; userRole?: string }) {
  const tooltipMap: Record<string, string> = {
    RECEIVE: 'inventory-movement-receive',
    CONSUME: 'inventory-movement-consume',
    ADJUST: 'inventory-movement-adjust',
  };
  
  return (
    <StatusBadge 
      status={type} 
      tooltipId={tooltipMap[type]} 
      userRole={userRole} 
    />
  );
}





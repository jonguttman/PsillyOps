'use client';

import React from 'react';
import Tooltip from './Tooltip';
import { getTooltip, canAccessTooltip } from '@/lib/data/tooltips';
import { UserRole } from '@/lib/types/enums';

export interface TooltipWrapperProps {
  /** ID of the tooltip to display (from tooltips.ts) */
  tooltipId: string;
  /** Current user's role for filtering */
  userRole?: UserRole | string;
  /** Position of tooltip relative to trigger */
  position?: 'top' | 'bottom';
  /** The element to wrap with tooltip */
  children: React.ReactNode;
}

/**
 * TooltipWrapper - Primary integration API for tooltips
 * 
 * Looks up tooltip content by ID from static registry,
 * checks user role for access, and renders Tooltip or just children.
 * 
 * Usage:
 * ```tsx
 * <TooltipWrapper tooltipId="ai-command-input" userRole={session.user.role}>
 *   <input ... />
 * </TooltipWrapper>
 * ```
 */
export default function TooltipWrapper({
  tooltipId,
  userRole,
  position = 'top',
  children
}: TooltipWrapperProps) {
  // Get tooltip data from static registry
  const tooltip = getTooltip(tooltipId);

  // If no tooltip found, just render children
  if (!tooltip) {
    return <>{children}</>;
  }

  // Check if user has access to this tooltip
  // If no role provided, show to all (guest mode)
  if (userRole && !canAccessTooltip(tooltip, userRole as UserRole)) {
    return <>{children}</>;
  }

  // Render tooltip with content
  return (
    <Tooltip
      title={tooltip.title}
      content={tooltip.content}
      helpLink={tooltip.helpLink}
      examples={tooltip.examples}
      position={position}
    >
      {children}
    </Tooltip>
  );
}

/**
 * Helper icon component for tooltip triggers
 * Use this next to labels or buttons to indicate help is available
 */
export function TooltipIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 hover:text-gray-600 ${className}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}







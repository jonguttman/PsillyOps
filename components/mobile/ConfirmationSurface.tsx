'use client';

/**
 * ConfirmationSurface Component
 * 
 * First-class confirmation handling for mobile.
 * Success replaces content (not banners).
 * Clear recovery actions.
 */

import React from 'react';
import { Check, ArrowRight, RefreshCw } from 'lucide-react';
import { CeramicCard, PillButton } from '@/components/mobile';

export interface ConfirmationAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  icon?: React.ReactNode;
}

interface ConfirmationSurfaceProps {
  title: string;
  message?: string;
  details?: Array<{ label: string; value: string }>;
  primaryAction: ConfirmationAction;
  secondaryAction?: ConfirmationAction;
  icon?: React.ReactNode;
  iconBgColor?: string;
  iconColor?: string;
}

export function ConfirmationSurface({
  title,
  message,
  details,
  primaryAction,
  secondaryAction,
  icon,
  iconBgColor = 'bg-green-100',
  iconColor = 'text-green-600',
}: ConfirmationSurfaceProps) {
  return (
    <div className="space-y-4">
      <CeramicCard>
        <div className="flex flex-col items-center text-center py-4">
          {/* Icon */}
          <div className={`w-16 h-16 rounded-full ${iconBgColor} flex items-center justify-center mb-4`}>
            {icon || <Check className={`w-8 h-8 ${iconColor}`} />}
          </div>
          
          {/* Title */}
          <p className="text-lg font-semibold text-gray-900">{title}</p>
          
          {/* Message */}
          {message && (
            <p className="text-sm text-gray-500 mt-1">{message}</p>
          )}
        </div>
        
        {/* Details */}
        {details && details.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            {details.map((detail, idx) => (
              <div key={idx} className="flex justify-between py-1">
                <span className="text-sm text-gray-500">{detail.label}</span>
                <span className="text-sm font-medium text-gray-900">{detail.value}</span>
              </div>
            ))}
          </div>
        )}
      </CeramicCard>

      {/* Actions */}
      <div className="space-y-2">
        <PillButton 
          variant="ceramic" 
          onClick={primaryAction.onClick}
          iconRight={primaryAction.icon || <ArrowRight className="w-4 h-4" />}
          className="w-full"
        >
          {primaryAction.label}
        </PillButton>
        
        {secondaryAction && (
          <PillButton 
            variant="glass" 
            onClick={secondaryAction.onClick}
            icon={secondaryAction.icon || <RefreshCw className="w-4 h-4" />}
            className="w-full"
          >
            {secondaryAction.label}
          </PillButton>
        )}
      </div>
    </div>
  );
}

export default ConfirmationSurface;


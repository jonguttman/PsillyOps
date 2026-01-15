'use client';

/**
 * ErrorSurface Component
 * 
 * First-class error handling for mobile.
 * Uses Ceramic warning surface.
 * Clear recovery actions.
 * No silent failures.
 */

import React from 'react';
import { AlertTriangle, RefreshCw, X, ArrowLeft } from 'lucide-react';
import { CeramicCard, PillButton } from '@/components/mobile';

export interface ErrorAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  icon?: React.ReactNode;
}

interface ErrorSurfaceProps {
  title: string;
  message: string;
  details?: string;
  primaryAction: ErrorAction;
  secondaryAction?: ErrorAction;
  icon?: React.ReactNode;
}

export function ErrorSurface({
  title,
  message,
  details,
  primaryAction,
  secondaryAction,
  icon,
}: ErrorSurfaceProps) {
  return (
    <div className="space-y-4">
      <CeramicCard variant="warning">
        <div className="flex flex-col items-center text-center py-4">
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
            {icon || <AlertTriangle className="w-8 h-8 text-red-600" />}
          </div>
          
          {/* Title */}
          <p className="text-lg font-semibold text-gray-900">{title}</p>
          
          {/* Message */}
          <p className="text-sm text-red-600 mt-1">{message}</p>
          
          {/* Details */}
          {details && (
            <p className="text-xs text-gray-500 mt-2 px-4">{details}</p>
          )}
        </div>
      </CeramicCard>

      {/* Actions */}
      <div className="space-y-2">
        <PillButton 
          variant="ceramic" 
          onClick={primaryAction.onClick}
          icon={primaryAction.icon || <RefreshCw className="w-4 h-4" />}
          className="w-full"
        >
          {primaryAction.label}
        </PillButton>
        
        {secondaryAction && (
          <PillButton 
            variant="glass" 
            onClick={secondaryAction.onClick}
            icon={secondaryAction.icon || <ArrowLeft className="w-4 h-4" />}
            className="w-full"
          >
            {secondaryAction.label}
          </PillButton>
        )}
      </div>
    </div>
  );
}

/**
 * NetworkErrorSurface - specialized for network/connection errors
 */
export function NetworkErrorSurface({
  onRetry,
  onCancel,
}: {
  onRetry: () => void;
  onCancel?: () => void;
}) {
  return (
    <ErrorSurface
      title="Connection Error"
      message="Unable to reach the server"
      details="Check your internet connection and try again."
      primaryAction={{
        label: 'Try Again',
        onClick: onRetry,
        icon: <RefreshCw className="w-4 h-4" />,
      }}
      secondaryAction={onCancel ? {
        label: 'Cancel',
        onClick: onCancel,
        icon: <X className="w-4 h-4" />,
      } : undefined}
    />
  );
}

/**
 * ValidationErrorSurface - specialized for validation errors
 */
export function ValidationErrorSurface({
  message,
  onFix,
  onCancel,
}: {
  message: string;
  onFix: () => void;
  onCancel?: () => void;
}) {
  return (
    <ErrorSurface
      title="Invalid Input"
      message={message}
      primaryAction={{
        label: 'Fix',
        onClick: onFix,
        icon: <ArrowLeft className="w-4 h-4" />,
      }}
      secondaryAction={onCancel ? {
        label: 'Cancel',
        onClick: onCancel,
        icon: <X className="w-4 h-4" />,
      } : undefined}
    />
  );
}

export default ErrorSurface;


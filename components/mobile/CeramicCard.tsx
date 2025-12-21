import { ReactNode } from 'react';

interface CeramicCardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'warning' | 'success';
}

/**
 * Ceramic Glass surface - tactile, grounded, action-oriented
 * 
 * Use for:
 * - Needs Attention / alerts
 * - Active production states
 * - Physical-state transitions
 * - Primary action containers
 * 
 * Errors should replace content, not stack on top.
 * Do NOT nest backdrop-filter (performance).
 */
export function CeramicCard({ 
  children, 
  className = '',
  variant = 'default'
}: CeramicCardProps) {
  const variantClass = variant === 'warning' 
    ? 'surface-ceramic-warning' 
    : 'surface-ceramic';
  
  return (
    <div className={`${variantClass} rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}


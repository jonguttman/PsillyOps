import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Pure Glass surface - informational, calm, Apple-native
 * 
 * Use for:
 * - Lists and activity feeds
 * - Navigation surfaces
 * - Informational content
 * 
 * Do NOT nest backdrop-filter (performance).
 */
export function GlassCard({ children, className = '' }: GlassCardProps) {
  return (
    <div className={`surface-glass rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}


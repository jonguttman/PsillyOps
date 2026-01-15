'use client';

import { ReactNode } from 'react';
import Link from 'next/link';

interface PillButtonProps {
  children: ReactNode;
  variant: 'glass' | 'ceramic';
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  className?: string;
  type?: 'button' | 'submit';
}

/**
 * Mobile-optimized pill button with glass/ceramic variants
 * 
 * - Glass: Secondary actions, navigation
 * - Ceramic: Primary actions, real-world consequences
 * 
 * Touch targets: 44px minimum height
 * Spacing: 8px minimum between buttons
 */
export function PillButton({
  children,
  variant,
  onClick,
  href,
  disabled = false,
  icon,
  iconRight,
  className = '',
  type = 'button',
}: PillButtonProps) {
  const baseStyles = `
    inline-flex items-center justify-center gap-2
    min-h-[44px] px-5 py-2.5
    rounded-full
    text-sm font-semibold
    transition-all duration-[var(--transition-fast)]
    disabled:opacity-50 disabled:cursor-not-allowed
    active:scale-[0.98]
  `;

  const variantStyles = variant === 'ceramic'
    ? 'surface-ceramic text-gray-900 hover:brightness-95'
    : 'surface-glass text-gray-700 hover:bg-white/80';

  const combinedStyles = `${baseStyles} ${variantStyles} ${className}`;

  const content = (
    <>
      {icon && <span className="w-5 h-5 flex items-center justify-center">{icon}</span>}
      <span>{children}</span>
      {iconRight && <span className="w-5 h-5 flex items-center justify-center">{iconRight}</span>}
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={combinedStyles}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={combinedStyles}
    >
      {content}
    </button>
  );
}


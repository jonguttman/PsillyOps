'use client';

import { ReactNode } from 'react';
import { MobileHeader } from './MobileHeader';
import { MobileBottomNav } from './MobileBottomNav';

interface MobileShellProps {
  children: ReactNode;
  showBack?: boolean;
  backHref?: string;
  title?: string;
  userRole?: string;
}

/**
 * Mobile shell wrapper - provides consistent structure
 * 
 * Structure:
 * - MobileHeader (fixed top)
 * - Scrollable content area with safe-area padding
 * - MobileBottomNav (fixed bottom)
 * 
 * Key rules:
 * - One scroll container (not nested)
 * - Bottom nav is fixed, outside scroll
 * - pb-24 ensures content doesn't hide behind nav
 * - Cards are never fixed or sticky in Phase 1
 */
export function MobileShell({ 
  children, 
  showBack = false,
  backHref,
  title,
  userRole = 'USER'
}: MobileShellProps) {
  return (
    <div 
      className="min-h-screen"
      style={{
        background: 'var(--mobile-bg-gradient)',
      }}
    >
      <MobileHeader showBack={showBack} backHref={backHref} title={title} />
      
      {/* 
        Main content area
        - pt accounts for header height + safe area
        - pb-24 ensures content doesn't hide behind bottom nav
        - px-4 for horizontal padding
      */}
      <main 
        className="
          overflow-y-auto
          pt-[calc(env(safe-area-inset-top,0px)+56px+16px)]
          pb-24
          px-4
          min-h-screen
        "
      >
        {children}
      </main>
      
      <MobileBottomNav userRole={userRole} />
    </div>
  );
}

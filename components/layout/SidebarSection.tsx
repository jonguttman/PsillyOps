'use client';

import { useState, useEffect, ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SidebarSectionProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  persistKey?: string; // Key for localStorage persistence
}

export function SidebarSection({ 
  title, 
  children, 
  defaultExpanded = true,
  persistKey
}: SidebarSectionProps) {
  const storageKey = persistKey ? `sidebar-section-${persistKey}` : null;
  
  // Always use defaultExpanded for initial state to match server render
  // This prevents hydration mismatch - localStorage is read in useEffect after mount
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [hasMounted, setHasMounted] = useState(false);

  // Read from localStorage AFTER hydration to prevent mismatch
  useEffect(() => {
    setHasMounted(true);
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        const storedBool = stored === 'true';
        if (storedBool !== defaultExpanded) {
          setIsExpanded(storedBool);
        }
      }
    }
  }, [storageKey, defaultExpanded]);

  // Sync to localStorage when state changes (only after mount)
  useEffect(() => {
    if (hasMounted && storageKey) {
      localStorage.setItem(storageKey, String(isExpanded));
    }
  }, [isExpanded, storageKey, hasMounted]);

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:bg-gray-100 rounded-md transition-colors"
      >
        <span>{title}</span>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
      {isExpanded && (
        <div className="mt-1 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

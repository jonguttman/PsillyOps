'use client';

import { useState } from 'react';
import AiCommandBar from './AiCommandBar';

interface AiCommandButtonProps {
  canUseAI: boolean;
}

export default function AiCommandButton({ canUseAI }: AiCommandButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Keyboard shortcut
  if (typeof window !== 'undefined') {
    // Only add listener once
    if (!(window as any).__aiCommandKeyListener) {
      (window as any).__aiCommandKeyListener = true;
      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          // Trigger a custom event that our component listens to
          window.dispatchEvent(new CustomEvent('openAiCommand'));
        }
      });
    }
  }

  // Listen for custom event
  if (typeof window !== 'undefined') {
    window.addEventListener('openAiCommand', () => {
      if (canUseAI) setIsOpen(true);
    }, { once: true });
  }

  if (!canUseAI) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        title="AI Command (Cmd+K)"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>AI</span>
        <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-xs font-semibold text-blue-200 bg-blue-700 rounded">
          ⌘K
        </kbd>
      </button>

      <AiCommandBar isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';

export interface TooltipProps {
  /** Tooltip title (bold) */
  title: string;
  /** Main tooltip content */
  content: string;
  /** Optional link to help documentation */
  helpLink?: string;
  /** Example commands or usage (optional) */
  examples?: string[];
  /** Position relative to trigger element */
  position?: 'top' | 'bottom';
  /** The trigger element */
  children: React.ReactNode;
}

/**
 * Base Tooltip Component
 * 
 * Features:
 * - Top/bottom positioning
 * - Hover + click (mobile) support
 * - Keyboard accessible (focus + Escape)
 * - ARIA compliant
 * - Respects prefers-reduced-motion
 */
export default function Tooltip({
  title,
  content,
  helpLink,
  examples,
  position = 'top',
  children
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useRef(`tooltip-${Math.random().toString(36).substr(2, 9)}`);

  // Detect touch device
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Handle click outside to close tooltip on mobile
  useEffect(() => {
    if (!isVisible || !isTouchDevice) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isVisible, isTouchDevice]);

  // Handle Escape key
  useEffect(() => {
    if (!isVisible) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsVisible(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isVisible]);

  const showTooltip = useCallback(() => setIsVisible(true), []);
  const hideTooltip = useCallback(() => setIsVisible(false), []);
  const toggleTooltip = useCallback(() => setIsVisible(prev => !prev), []);

  // Event handlers
  const handleMouseEnter = isTouchDevice ? undefined : showTooltip;
  const handleMouseLeave = isTouchDevice ? undefined : hideTooltip;
  const handleClick = isTouchDevice ? toggleTooltip : undefined;
  const handleFocus = showTooltip;
  const handleBlur = hideTooltip;

  // Position classes
  const positionClasses = position === 'top'
    ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
    : 'top-full left-1/2 -translate-x-1/2 mt-2';

  const arrowClasses = position === 'top'
    ? 'top-full left-1/2 -translate-x-1/2 border-t-gray-900'
    : 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900';

  const arrowBorder = position === 'top'
    ? 'border-l-transparent border-r-transparent border-b-transparent border-t-8 border-l-8 border-r-8'
    : 'border-l-transparent border-r-transparent border-t-transparent border-b-8 border-l-8 border-r-8';

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {/* Trigger element with accessibility attributes */}
      <div
        aria-describedby={isVisible ? tooltipId.current : undefined}
        className="cursor-help"
      >
        {children}
      </div>

      {/* Tooltip */}
      {isVisible && (
        <div
          ref={tooltipRef}
          id={tooltipId.current}
          role="tooltip"
          className={`
            absolute z-50 w-72 p-3 
            bg-gray-900 text-white text-sm rounded-lg shadow-lg
            ${positionClasses}
            motion-safe:animate-fadeIn motion-reduce:animate-none
          `}
        >
          {/* Arrow */}
          <div
            className={`
              absolute w-0 h-0 
              ${arrowClasses}
              ${arrowBorder}
            `}
          />

          {/* Title */}
          <div className="font-semibold text-white mb-1">{title}</div>

          {/* Content */}
          <div className="text-gray-300 text-xs leading-relaxed">{content}</div>

          {/* Examples */}
          {examples && examples.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <div className="text-xs text-gray-400 mb-1">Examples:</div>
              <ul className="text-xs text-gray-300 space-y-0.5">
                {examples.slice(0, 3).map((example, index) => (
                  <li key={index} className="font-mono text-blue-300">
                    "{example}"
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Help Link */}
          {helpLink && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <Link
                href={helpLink}
                className="text-xs text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                Learn more
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


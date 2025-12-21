'use client';

/**
 * Verification Animation Component
 * 
 * Handles the verification handshake animation and final state reveal.
 * Pure CSS/Tailwind animations - no animation libraries.
 * 
 * Animation specs:
 * - Duration: 700ms fixed
 * - Easing: cubic-bezier(0.2, 0.8, 0.2, 1)
 * - Visual: Left-to-right line sweep (1-2px, gray → brand accent)
 * - Text: "Verifying product authenticity"
 * - Final state: 200ms opacity fade-in
 */

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import type { VerificationState } from '@/lib/utils/verificationState';

interface VerificationAnimationProps {
  verificationState: VerificationState;
  stateLabel: string;
  stateDescription: string;
  revokedReason?: string | null;
  onAnimationComplete?: () => void;
}

export function VerificationAnimation({
  verificationState,
  stateLabel,
  stateDescription,
  revokedReason,
  onAnimationComplete
}: VerificationAnimationProps) {
  const [isAnimating, setIsAnimating] = useState(true);
  const [showFinalState, setShowFinalState] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check for reduced motion preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Animation sequence
  useEffect(() => {
    if (prefersReducedMotion) {
      // Skip animation entirely if reduced motion
      setIsAnimating(false);
      setShowFinalState(true);
      onAnimationComplete?.();
      return;
    }

    // Fixed 700ms animation duration
    const animationDuration = 700;
    
    // After animation completes, reveal final state
    const timer = setTimeout(() => {
      setIsAnimating(false);
      // Reveal final state immediately (fade-in handled by CSS transition)
      setShowFinalState(true);
      onAnimationComplete?.();
    }, animationDuration);

    return () => clearTimeout(timer);
  }, [prefersReducedMotion, onAnimationComplete]);

  // Determine icon and colors based on state
  const getStateConfig = () => {
    switch (verificationState) {
      case 'VERIFIED':
        return {
          icon: CheckCircle,
          iconColor: 'text-green-600',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-200'
        };
      case 'REVOKED':
        return {
          icon: XCircle,
          iconColor: 'text-amber-600',
          bgColor: 'bg-amber-100',
          borderColor: 'border-amber-200'
        };
      case 'EXPIRED':
        return {
          icon: AlertTriangle,
          iconColor: 'text-amber-600',
          bgColor: 'bg-amber-100',
          borderColor: 'border-amber-200'
        };
      default:
        return {
          icon: AlertTriangle,
          iconColor: 'text-gray-600',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200'
        };
    }
  };

  const config = getStateConfig();
  const Icon = config.icon;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="text-center">
        {/* Animation Phase */}
        {isAnimating && (
          <div className="space-y-4">
            {/* Animation Text */}
            <p className="text-sm text-gray-600 font-medium">
              Verifying product authenticity
            </p>
            
            {/* Line Sweep Container */}
            <div className="relative h-1 bg-gray-100 rounded-full overflow-hidden max-w-xs mx-auto">
              {/* Sweep Line */}
              <div
                className={`absolute top-0 left-0 h-full w-full bg-gradient-to-r from-gray-300 via-blue-500 to-blue-600 rounded-full ${
                  prefersReducedMotion ? '' : 'animate-lineSweep'
                }`}
              />
            </div>
          </div>
        )}

        {/* Final State Phase */}
        {!isAnimating && (
          <div
            className={`transition-opacity duration-200 ${
              showFinalState ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* Status Icon */}
            <div className="flex justify-center mb-4">
              <div className={`w-16 h-16 rounded-full ${config.bgColor} flex items-center justify-center`}>
                <Icon className={`w-10 h-10 ${config.iconColor}`} />
              </div>
            </div>

            {/* Status Text */}
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {verificationState === 'VERIFIED' ? 'Product Authentication Verified' : stateLabel}
            </h2>

            {/* Status Description */}
            <p className="text-gray-600 text-sm">
              {verificationState === 'VERIFIED' 
                ? stateDescription 
                : (revokedReason || stateDescription)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}


/**
 * Reduced Motion Utilities
 * 
 * Detects user preference for reduced motion and provides
 * animation control for accessibility.
 */

/**
 * Check if user prefers reduced motion
 * 
 * This should be called client-side only (browser API).
 * Returns false by default for SSR safety.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') {
    return false; // SSR: default to no animation
  }

  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false; // Fallback if media query fails
  }
}

/**
 * Get animation duration based on reduced motion preference
 * 
 * @param defaultDuration - Default animation duration in milliseconds
 * @returns Duration in milliseconds (0 if reduced motion, otherwise default)
 */
export function getAnimationDuration(defaultDuration: number): number {
  if (typeof window === 'undefined') {
    return 0; // SSR: no animation
  }

  return prefersReducedMotion() ? 0 : defaultDuration;
}


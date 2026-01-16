/**
 * Quality Data Types for Batch Verification
 *
 * This module defines the structure for quality information displayed
 * on public batch verification pages. This is manufacturer-published data
 * for transparency purposes, NOT independent lab certification.
 */

/**
 * Status options for safety screening tests
 */
export type SafetyStatus = 'passed' | 'within_limits' | 'no_pathogens' | 'pending' | 'not_tested';

/**
 * Level indicators for active components (qualitative only - NO percentages)
 */
export type ComponentLevel = 'high' | 'moderate' | 'present' | 'trace';

/**
 * Identity confirmation section
 * Documents species, form, and identification method
 */
export interface IdentityConfirmation {
  /** Species name, e.g., "Hericium erinaceus (Lion's Mane)" */
  species?: string;
  /** Physical form, e.g., "Dried fruiting body powder" */
  form?: string;
  /** Identification method, e.g., "Visual & reference identification" */
  method?: string;
}

/**
 * Individual safety screening test result
 */
export interface SafetyTest {
  status: SafetyStatus;
}

/**
 * Safety screening section
 * Contains pass/fail style results for standard safety tests
 */
export interface SafetyScreening {
  heavyMetals?: SafetyTest;
  microbialScreen?: SafetyTest;
  visualInspection?: SafetyTest;
}

/**
 * Active component entry
 * Qualitative display only - NO exact percentages
 */
export interface ActiveComponent {
  /** Component name, e.g., "Beta-Glucans", "Polysaccharides" */
  name: string;
  /** Qualitative level indicator */
  level: ComponentLevel;
}

/**
 * Complete quality data structure for a batch
 * Stored as JSON in the Batch.qualityData field
 */
export interface QualityData {
  identityConfirmation?: IdentityConfirmation;
  safetyScreening?: SafetyScreening;
  activeComponents?: ActiveComponent[];
  /** Custom disclaimer text (optional override of default) */
  disclaimer?: string;
}

/**
 * Default disclaimer shown when no custom disclaimer is provided
 */
export const DEFAULT_QUALITY_DISCLAIMER =
  'This quality overview presents internal and partner-provided testing data for transparency purposes. ' +
  'This information is published by the manufacturer and does not constitute independent lab certification.';

/**
 * Display labels for safety status values
 */
export const SAFETY_STATUS_LABELS: Record<SafetyStatus, string> = {
  passed: 'Passed',
  within_limits: 'Within Limits',
  no_pathogens: 'No Pathogens Detected',
  pending: 'Pending',
  not_tested: 'Not Tested',
};

/**
 * Display labels for component level values
 */
export const COMPONENT_LEVEL_LABELS: Record<ComponentLevel, string> = {
  high: 'High',
  moderate: 'Moderate',
  present: 'Present',
  trace: 'Trace',
};

/**
 * Styling classes for safety status badges
 */
export const SAFETY_STATUS_STYLES: Record<SafetyStatus, string> = {
  passed: 'bg-green-100 text-green-800',
  within_limits: 'bg-green-100 text-green-800',
  no_pathogens: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  not_tested: 'bg-gray-100 text-gray-600',
};

/**
 * Styling classes for component level badges
 */
export const COMPONENT_LEVEL_STYLES: Record<ComponentLevel, string> = {
  high: 'bg-emerald-100 text-emerald-800',
  moderate: 'bg-blue-100 text-blue-800',
  present: 'bg-gray-100 text-gray-700',
  trace: 'bg-gray-50 text-gray-500',
};

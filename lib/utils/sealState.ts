/**
 * Seal State Utilities
 * 
 * Centralizes seal state resolution from token status, seal sheet, and binding.
 * Used by seal page to determine certification participation status.
 * 
 * NOTE: This utility intentionally duplicates logic from verificationState.ts
 * to preserve semantic isolation between authenticity (/verify) and 
 * certification participation (/seal).
 * 
 * Phase 2B: Now considers seal sheet assignment and experience binding status.
 */

import { QRTokenStatus, SealSheetStatus } from '@prisma/client';

export type SealState = 
  | 'SHEET_UNASSIGNED'  // Sheet not assigned to partner
  | 'SEAL_UNBOUND'      // Sheet assigned, seal not bound to product
  | 'ACTIVE'            // Bound and active
  | 'REVOKED'           // Token or sheet revoked
  | 'EXPIRED';          // Token expired

export interface TokenStatusInfo {
  status: QRTokenStatus;
  expiresAt: Date | null;
  sealSheet?: {
    status: SealSheetStatus;
    partnerId: string | null;
  } | null;
  hasBinding?: boolean;
}

/**
 * Resolve seal state from token status, seal sheet, and binding
 * 
 * SealState resolution precedence (highest → lowest):
 *
 * 1. Token REVOKED
 * 2. Token EXPIRED
 * 3. SealSheet REVOKED
 * 4. Sheet UNASSIGNED (or no sheet)
 * 5. Seal UNBOUND (no ExperienceBinding)
 * 6. ACTIVE
 *
 * This ordering is intentional and must not be changed without
 * reviewing public certification semantics.
 */
export function resolveSealState(
  tokenInfo: TokenStatusInfo | null
): SealState {
  if (!tokenInfo) {
    // No token info - default to unbound (lowest precedence)
    return 'SEAL_UNBOUND';
  }

  // PRECEDENCE 1: Token REVOKED (highest precedence)
  if (tokenInfo.status === 'REVOKED') {
    return 'REVOKED';
  }

  // PRECEDENCE 2: Token EXPIRED
  // Check both explicit EXPIRED status and expiresAt date
  if (tokenInfo.status === 'EXPIRED') {
    return 'EXPIRED';
  }
  if (tokenInfo.expiresAt && tokenInfo.expiresAt < new Date()) {
    return 'EXPIRED';
  }

  // PRECEDENCE 3: SealSheet REVOKED
  if (tokenInfo.sealSheet?.status === 'REVOKED') {
    return 'REVOKED';
  }

  // PRECEDENCE 4: Sheet UNASSIGNED (or no sheet)
  if (!tokenInfo.sealSheet) {
    // No seal sheet means token wasn't issued as a TripDAR seal
    return 'SEAL_UNBOUND';
  }
  if (tokenInfo.sealSheet.status === 'UNASSIGNED' || !tokenInfo.sealSheet.partnerId) {
    return 'SHEET_UNASSIGNED';
  }

  // PRECEDENCE 5: Seal UNBOUND (no ExperienceBinding)
  if (!tokenInfo.hasBinding) {
    return 'SEAL_UNBOUND';
  }

  // PRECEDENCE 6: ACTIVE (all checks passed)
  return 'ACTIVE';
}

/**
 * Get human-readable label for seal state
 */
export function getSealStateLabel(state: SealState): string {
  switch (state) {
    case 'ACTIVE':
      return 'TripDAR Certified Participation';
    case 'SHEET_UNASSIGNED':
      return 'TripDAR Ready — Not Yet Activated';
    case 'SEAL_UNBOUND':
      return 'TripDAR Ready — Awaiting Product Assignment';
    case 'REVOKED':
      return 'Certification Revoked';
    case 'EXPIRED':
      return 'Certification Expired';
  }
}

/**
 * Get description text for seal state
 */
export function getSealStateDescription(state: SealState): string {
  switch (state) {
    case 'ACTIVE':
      return 'This product participates in TripDAR, an anonymous experience data collection system.';
    case 'SHEET_UNASSIGNED':
      return 'This seal has been generated but not yet assigned to a partner. It will be activated once assigned.';
    case 'SEAL_UNBOUND':
      return 'This seal has been assigned to a partner but is not yet bound to a product. It will be activated once bound.';
    case 'REVOKED':
      return 'This product\'s certification has been revoked. Participation is no longer available.';
    case 'EXPIRED':
      return 'This product\'s certification has expired. Participation is no longer available.';
  }
}


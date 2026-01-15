/**
 * Verification State Utilities
 * 
 * Centralizes verification state resolution from token status and expiration.
 * Used by verification page and future TripDAR integration.
 */

import { QRTokenStatus } from '@prisma/client';

export type VerificationState = 'VERIFIED' | 'REVOKED' | 'EXPIRED' | 'UNKNOWN';

export interface TokenStatusInfo {
  status: QRTokenStatus;
  expiresAt: Date | null;
}

/**
 * Resolve verification state from token status and expiration
 * 
 * Rules:
 * - ACTIVE + not expired → VERIFIED
 * - ACTIVE + expired → EXPIRED
 * - REVOKED → REVOKED (regardless of expiration)
 * - EXPIRED → EXPIRED
 * - Unknown/null → UNKNOWN
 */
export function resolveVerificationState(
  tokenInfo: TokenStatusInfo | null
): VerificationState {
  if (!tokenInfo) {
    return 'UNKNOWN';
  }

  // REVOKED takes precedence over expiration
  if (tokenInfo.status === 'REVOKED') {
    return 'REVOKED';
  }

  // Check expiration for ACTIVE tokens
  if (tokenInfo.status === 'ACTIVE') {
    if (tokenInfo.expiresAt && tokenInfo.expiresAt < new Date()) {
      return 'EXPIRED';
    }
    return 'VERIFIED';
  }

  // EXPIRED status
  if (tokenInfo.status === 'EXPIRED') {
    return 'EXPIRED';
  }

  return 'UNKNOWN';
}

/**
 * Get human-readable label for verification state
 */
export function getVerificationStateLabel(state: VerificationState): string {
  switch (state) {
    case 'VERIFIED':
      return 'Authentic Product Verified';
    case 'REVOKED':
      return 'This Product Has Been Revoked';
    case 'EXPIRED':
      return 'This Verification Code Is Expired';
    case 'UNKNOWN':
      return 'Verification Status Unknown';
  }
}

/**
 * Get description text for verification state
 */
export function getVerificationStateDescription(state: VerificationState): string {
  switch (state) {
    case 'VERIFIED':
      return 'This product was successfully verified against official records.';
    case 'REVOKED':
      return 'This product has been invalidated.';
    case 'EXPIRED':
      return 'This verification code is no longer valid.';
    case 'UNKNOWN':
      return 'Unable to determine verification status.';
  }
}


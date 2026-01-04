/**
 * TripDAR Public Token Utilities
 * 
 * Handles validation and generation of short Base62 tokens for tripd.ar QR codes.
 * 
 * Token Format:
 * - Alphabet: 0-9, a-z, A-Z (Base62, case-sensitive)
 * - Length: 5-6 characters
 * - Generated: Cryptographically random
 * 
 * Examples: f9Qa5, Nm4Zt, 3XpQe, aB7kL
 */

import crypto from 'crypto';

// Base62 alphabet: 0-9, a-z, A-Z
const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE62_REGEX = /^[0-9a-zA-Z]+$/;

// Token length constraints
const MIN_TOKEN_LENGTH = 5;
const MAX_TOKEN_LENGTH = 6;
const DEFAULT_TOKEN_LENGTH = 6;

// Maximum collision retry attempts
const MAX_COLLISION_RETRIES = 3;

export type TokenValidationResult = 
  | { ok: true }
  | { ok: false; reason: 'missing' | 'format' | 'length' };

/**
 * Validate a public token format
 * 
 * Does NOT check database existence - only format validation.
 * 
 * @param token - The token string to validate
 * @returns Validation result with reason if invalid
 */
export function validatePublicToken(token: string): TokenValidationResult {
  if (!token) {
    return { ok: false, reason: 'missing' };
  }

  if (!BASE62_REGEX.test(token)) {
    return { ok: false, reason: 'format' };
  }

  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: 'length' };
  }

  return { ok: true };
}

/**
 * Generate a cryptographically random Base62 token
 * 
 * Uses rejection sampling to ensure uniform distribution.
 * 
 * @param length - Token length (default: 6)
 * @returns Random Base62 token string
 */
export function generatePublicToken(length: number = DEFAULT_TOKEN_LENGTH): string {
  const bytes = crypto.randomBytes(length);
  let token = '';

  for (let i = 0; i < length; i++) {
    // Use modulo with rejection sampling for uniform distribution
    // 256 % 62 = 8, so we reject values >= 248 to avoid bias
    let byte = bytes[i];
    while (byte >= 248) {
      byte = crypto.randomBytes(1)[0];
    }
    token += BASE62_ALPHABET[byte % 62];
  }

  return token;
}

/**
 * Generate a unique token with collision checking
 * 
 * @param existsCheck - Async function to check if token exists in database
 * @param length - Token length (default: 6)
 * @returns Unique token string
 * @throws Error if max retries exceeded (indicates system issue)
 */
export async function generateUniqueToken(
  existsCheck: (token: string) => Promise<boolean>,
  length: number = DEFAULT_TOKEN_LENGTH
): Promise<string> {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const token = generatePublicToken(length);
    const exists = await existsCheck(token);
    
    if (!exists) {
      return token;
    }
    
    console.warn(`[tripdar/token] Collision detected for token attempt ${attempt + 1}`);
  }

  throw new Error(`Failed to generate unique token after ${MAX_COLLISION_RETRIES} attempts`);
}

/**
 * Token length constants for external use
 */
export const TOKEN_LENGTHS = {
  MIN: MIN_TOKEN_LENGTH,
  MAX: MAX_TOKEN_LENGTH,
  DEFAULT: DEFAULT_TOKEN_LENGTH,
} as const;


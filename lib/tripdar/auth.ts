/**
 * TripDAR API Authentication
 * 
 * Validates the X-Tripdar-Key header for server-to-server calls from Tripd.ar
 * 
 * SECURITY:
 * - TRIPDAR_API_KEY must be set in environment
 * - Key comparison uses constant-time comparison to prevent timing attacks
 * - Returns opaque error to prevent key enumeration
 */

import { NextRequest } from 'next/server';

/**
 * Validate the Tripd.ar API key from request headers
 * 
 * @param req - Next.js request object
 * @returns { ok: true } if valid, { ok: false } if invalid
 */
export function requireTripdarKey(req: NextRequest): { ok: true } | { ok: false } {
  const key = req.headers.get('x-tripdar-key');
  const expected = process.env.TRIPDAR_API_KEY;

  // Fail if no key configured (misconfiguration)
  if (!expected) {
    console.error('[tripdar/auth] TRIPDAR_API_KEY not configured');
    return { ok: false };
  }

  // Fail if no key provided
  if (!key) {
    return { ok: false };
  }

  // Constant-time comparison to prevent timing attacks
  if (key.length !== expected.length) {
    return { ok: false };
  }

  let mismatch = 0;
  for (let i = 0; i < key.length; i++) {
    mismatch |= key.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  if (mismatch !== 0) {
    return { ok: false };
  }

  return { ok: true };
}


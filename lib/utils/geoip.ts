/**
 * IP-based geolocation utility for passive location capture
 * Used by QR token resolver to log approximate scan locations
 */

export interface GeoInfo {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
}

/**
 * Extract client IP from request headers
 * Handles various proxy configurations (Vercel, Cloudflare, nginx, etc.)
 */
export function extractClientIP(headers: Headers): string {
  // Vercel / general proxy
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP (original client) from comma-separated list
    return forwardedFor.split(',')[0].trim();
  }

  // Cloudflare
  const cfConnectingIP = headers.get('cf-connecting-ip');
  if (cfConnectingIP) return cfConnectingIP;

  // nginx real IP
  const realIP = headers.get('x-real-ip');
  if (realIP) return realIP;

  return 'unknown';
}

/**
 * Check if running on Vercel and extract geo from their headers
 * Vercel automatically adds geo headers for Edge/Serverless functions
 */
export function extractVercelGeo(headers: Headers): GeoInfo | null {
  const city = headers.get('x-vercel-ip-city');
  const region = headers.get('x-vercel-ip-country-region');
  const country = headers.get('x-vercel-ip-country');

  // If any Vercel geo header is present, use them
  if (city || region || country) {
    return {
      city: city ? decodeURIComponent(city) : null,
      region: region || null,
      country: country || null,
      countryCode: country || null,
    };
  }

  return null;
}

/**
 * Lookup geo information from IP address using ip-api.com
 * Free tier: 45 requests/minute, no API key needed
 *
 * Note: ip-api.com free tier doesn't support HTTPS, but for non-sensitive
 * geo lookup this is acceptable. For production, consider:
 * - ipinfo.io (50k/month free with HTTPS)
 * - MaxMind GeoLite2 (self-hosted, no external calls)
 */
export async function getGeoFromIP(ip: string): Promise<GeoInfo | null> {
  // Skip lookup for local/unknown IPs
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null;
  }

  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,city,regionName,country,countryCode`,
      {
        // Cache geo lookups for 24 hours per IP
        next: { revalidate: 86400 },
      }
    );

    if (!res.ok) return null;

    const data = await res.json();

    if (data.status !== 'success') return null;

    return {
      city: data.city || null,
      region: data.regionName || null,
      country: data.country || null,
      countryCode: data.countryCode || null,
    };
  } catch {
    // Fail silently - geo is nice-to-have, not critical
    return null;
  }
}

/**
 * Main entry point: Get geo info from request headers
 * Tries Vercel headers first (free, instant), falls back to IP lookup
 */
export async function getGeoFromRequest(headers: Headers): Promise<GeoInfo | null> {
  // First, check for Vercel's built-in geo headers (instant, no API call)
  const vercelGeo = extractVercelGeo(headers);
  if (vercelGeo) return vercelGeo;

  // Fall back to IP-based lookup
  const ip = extractClientIP(headers);
  return getGeoFromIP(ip);
}

// API Route: Get recent QR scans for dashboard
// Returns enriched scan data from activity logs

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getRecentQRScans } from '@/lib/services/qrTokenService';
import { handleApiError } from '@/lib/utils/errors';

/**
 * GET /api/qr-tokens/recent-scans
 * Get recent QR scans with enriched data
 * 
 * Query params:
 * - limit: Max results (default 20)
 * 
 * Accessible to ADMIN, PRODUCTION, WAREHOUSE roles.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Check role
    if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE'].includes(session.user.role)) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const scans = await getRecentQRScans(Math.min(limit, 50));

    return Response.json({
      scans: scans.map(scan => ({
        ...scan,
        scannedAt: scan.scannedAt.toISOString()
      }))
    });

  } catch (error) {
    return handleApiError(error);
  }
}


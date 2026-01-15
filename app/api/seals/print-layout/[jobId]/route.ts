/**
 * Seal Print Job Management API
 * 
 * POST /api/seals/print-layout/[jobId]/confirm
 * - Confirm a print job was successfully printed
 * 
 * POST /api/seals/print-layout/[jobId]/cancel
 * - Cancel a print job (releases tokens back to unprinted)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import {
  confirmPrintJob,
  cancelPrintJob,
} from '@/lib/services/sealPrintLayoutService';
import { handleApiError } from '@/lib/utils/errors';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

// ========================================
// POST /api/seals/print-layout/[jobId]
// Confirm or cancel a print job
// ========================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;

    // Authentication required
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Permission check: ADMIN or WAREHOUSE only
    const userRole = session.user.role;
    if (userRole !== 'ADMIN' && userRole !== 'WAREHOUSE') {
      return NextResponse.json(
        { error: 'Insufficient permissions. ADMIN or WAREHOUSE role required.' },
        { status: 403 }
      );
    }

    // Parse request body
    let body: { action: string; reason?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { action, reason } = body;

    if (action === 'confirm') {
      await confirmPrintJob(jobId, session.user.id);
      return NextResponse.json({
        success: true,
        message: 'Print job confirmed',
      });
    }

    if (action === 'cancel') {
      if (!reason) {
        return NextResponse.json(
          { error: 'Reason is required when cancelling a print job' },
          { status: 400 }
        );
      }
      await cancelPrintJob(jobId, reason, session.user.id);
      return NextResponse.json({
        success: true,
        message: 'Print job cancelled, tokens released',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Must be "confirm" or "cancel"' },
      { status: 400 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}


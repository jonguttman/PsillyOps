/**
 * Partner Session API
 * 
 * POST   /api/partner/session - Start new binding session
 * GET    /api/partner/session - Get active session
 * DELETE /api/partner/session - End session
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { isPartnerUser, canBindSeals } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { handleApiError } from '@/lib/utils/errors';
import {
  startSession,
  endSession,
  getActiveSession,
} from '@/lib/services/bindingSessionService';

/**
 * POST /api/partner/session
 * 
 * Start a new binding session for the partner.
 * Automatically terminates any existing ACTIVE session.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!isPartnerUser(session.user.role as UserRole)) {
      return NextResponse.json(
        { error: 'Partner access required' },
        { status: 403 }
      );
    }

    if (!canBindSeals(session.user.role as UserRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to bind seals' },
        { status: 403 }
      );
    }

    if (!session.user.partnerId) {
      return NextResponse.json(
        { error: 'User is not assigned to a partner' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { partnerProductId, durationMinutes } = body;

    if (!partnerProductId) {
      return NextResponse.json(
        { error: 'partnerProductId is required' },
        { status: 400 }
      );
    }

    const bindingSession = await startSession({
      partnerId: session.user.partnerId,
      partnerProductId,
      userId: session.user.id,
      durationMinutes,
    });

    return NextResponse.json({ session: bindingSession }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/partner/session
 * 
 * Get the active binding session for the partner.
 * Returns null if no active session exists.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!isPartnerUser(session.user.role as UserRole)) {
      return NextResponse.json(
        { error: 'Partner access required' },
        { status: 403 }
      );
    }

    if (!session.user.partnerId) {
      return NextResponse.json(
        { error: 'User is not assigned to a partner' },
        { status: 400 }
      );
    }

    const bindingSession = await getActiveSession(session.user.partnerId);

    return NextResponse.json({ session: bindingSession });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/partner/session
 * 
 * End the active binding session.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!isPartnerUser(session.user.role as UserRole)) {
      return NextResponse.json(
        { error: 'Partner access required' },
        { status: 403 }
      );
    }

    if (!session.user.partnerId) {
      return NextResponse.json(
        { error: 'User is not assigned to a partner' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const bindingSession = await endSession(sessionId, session.user.id);

    return NextResponse.json({ session: bindingSession });
  } catch (error) {
    return handleApiError(error);
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getLabelVersion, updateVersionQrPosition } from '@/lib/services/labelService';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';

/**
 * GET /api/labels/versions/[id]
 * Get a label version by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const version = await getLabelVersion(id);

    return NextResponse.json(version);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/labels/versions/[id]
 * Update label version settings (qrScale, qrOffsetX, qrOffsetY)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check permissions - need templates create/manage permission
    if (!hasPermission(session.user.role, 'templates', 'create')) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    // Build settings object from valid fields
    const settings: { qrScale?: number; qrOffsetX?: number; qrOffsetY?: number } = {};

    // Validate qrScale if provided (10% to 150%)
    if (body.qrScale !== undefined) {
      const qrScale = parseFloat(body.qrScale);
      if (isNaN(qrScale) || qrScale < 0.1 || qrScale > 1.5) {
        return NextResponse.json(
          { error: 'qrScale must be a number between 0.1 (10%) and 1.5 (150%)' },
          { status: 400 }
        );
      }
      settings.qrScale = qrScale;
    }

    // Validate qrOffsetX if provided
    if (body.qrOffsetX !== undefined) {
      const qrOffsetX = parseFloat(body.qrOffsetX);
      if (isNaN(qrOffsetX)) {
        return NextResponse.json(
          { error: 'qrOffsetX must be a number' },
          { status: 400 }
        );
      }
      settings.qrOffsetX = qrOffsetX;
    }

    // Validate qrOffsetY if provided
    if (body.qrOffsetY !== undefined) {
      const qrOffsetY = parseFloat(body.qrOffsetY);
      if (isNaN(qrOffsetY)) {
        return NextResponse.json(
          { error: 'qrOffsetY must be a number' },
          { status: 400 }
        );
      }
      settings.qrOffsetY = qrOffsetY;
    }

    // Check if any valid fields to update
    if (Object.keys(settings).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update. Supported: qrScale, qrOffsetX, qrOffsetY' },
        { status: 400 }
      );
    }

    const updated = await updateVersionQrPosition(id, settings, session.user.id);
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}


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
    const settings: { 
      qrScale?: number; 
      qrOffsetX?: number; 
      qrOffsetY?: number;
      labelWidthIn?: number;
      labelHeightIn?: number;
      contentScale?: number;
      contentOffsetX?: number;
      contentOffsetY?: number;
    } = {};

    // Validate qrScale if provided (10% to 150%)
    if (body.qrScale !== undefined) {
      const val = parseFloat(body.qrScale);
      if (isNaN(val) || val < 0.1 || val > 1.5) {
        return NextResponse.json({ error: 'qrScale must be between 0.1 and 1.5' }, { status: 400 });
      }
      settings.qrScale = val;
    }

    // Validate offsets and other numeric fields
    const numericFields = ['qrOffsetX', 'qrOffsetY', 'labelWidthIn', 'labelHeightIn', 'contentScale', 'contentOffsetX', 'contentOffsetY'];
    
    for (const field of numericFields) {
      if (body[field] !== undefined) {
        const val = parseFloat(body[field]);
        if (isNaN(val)) {
          return NextResponse.json({ error: `${field} must be a number` }, { status: 400 });
        }
        // Additional checks
        if ((field === 'labelWidthIn' || field === 'labelHeightIn' || field === 'contentScale') && val <= 0) {
          return NextResponse.json({ error: `${field} must be positive` }, { status: 400 });
        }
        (settings as any)[field] = val;
      }
    }

    // Check if any valid fields to update
    if (Object.keys(settings).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const updated = await updateVersionQrPosition(id, settings, session.user.id);
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}


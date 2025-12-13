import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { renderLabelPreview } from '@/lib/services/labelService';
import { handleApiError } from '@/lib/utils/errors';

export async function POST(req: Request) {
  try {
    const session = await auth();
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { versionId, qrScale, qrOffsetX, qrOffsetY } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: 'versionId is required' },
        { status: 400 }
      );
    }

    // Build overrides object for live preview
    const overrides: { qrScale?: number; qrOffsetX?: number; qrOffsetY?: number } = {};
    
    if (qrScale !== undefined) {
      const parsedScale = parseFloat(qrScale);
      if (!isNaN(parsedScale) && parsedScale >= 0.1 && parsedScale <= 1.5) {
        overrides.qrScale = parsedScale;
      }
    }
    
    if (qrOffsetX !== undefined) {
      const parsedX = parseFloat(qrOffsetX);
      if (!isNaN(parsedX)) {
        overrides.qrOffsetX = parsedX;
      }
    }
    
    if (qrOffsetY !== undefined) {
      const parsedY = parseFloat(qrOffsetY);
      if (!isNaN(parsedY)) {
        overrides.qrOffsetY = parsedY;
      }
    }

    const svg = await renderLabelPreview(
      versionId, 
      Object.keys(overrides).length > 0 ? overrides : undefined
    );

    return new NextResponse(svg, {
      headers: { 'Content-Type': 'image/svg+xml' }
    });
  } catch (error) {
    return handleApiError(error);
  }
}


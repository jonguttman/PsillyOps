import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { renderLetterSheetPreview } from '@/lib/services/labelService';
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
    const { versionId, quantity, qrScale, qrOffsetX, qrOffsetY } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: 'versionId is required' },
        { status: 400 }
      );
    }

    // Parse QR position overrides
    let parsedQrScale: number | undefined;
    if (qrScale !== undefined) {
      const scale = parseFloat(qrScale);
      if (!isNaN(scale) && scale >= 0.1 && scale <= 1.5) {
        parsedQrScale = scale;
      }
    }

    let parsedOffsetX: number | undefined;
    if (qrOffsetX !== undefined) {
      const x = parseFloat(qrOffsetX);
      if (!isNaN(x)) parsedOffsetX = x;
    }

    let parsedOffsetY: number | undefined;
    if (qrOffsetY !== undefined) {
      const y = parseFloat(qrOffsetY);
      if (!isNaN(y)) parsedOffsetY = y;
    }

    const result = await renderLetterSheetPreview({
      versionId,
      quantity: parseInt(quantity, 10) || 1,
      qrScale: parsedQrScale,
      qrOffsetX: parsedOffsetX,
      qrOffsetY: parsedOffsetY
    });

    return new NextResponse(result.svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'X-Label-Columns': String(result.meta.columns),
        'X-Label-Rows': String(result.meta.rows),
        'X-Label-Per-Sheet': String(result.meta.perSheet),
        'X-Label-Rotation-Used': String(result.meta.rotationUsed),
        'X-Label-Total-Sheets': String(result.meta.totalSheets)
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}


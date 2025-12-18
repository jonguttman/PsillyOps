import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getLabelVersion, updateVersionElements, getLabelMetadata } from '@/lib/services/labelService';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { PlaceableElement, validateElements } from '@/lib/types/placement';

/**
 * GET /api/labels/versions/[id]
 * Get a label version by ID with elements array
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
    
    // Get metadata including resolved elements (handles default creation)
    const meta = await getLabelMetadata(id);

    return NextResponse.json({
      ...version,
      // Ensure elements is always an array (resolved from stored or default)
      elements: meta.elements,
      labelMeta: {
        widthIn: meta.widthIn,
        heightIn: meta.heightIn
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/labels/versions/[id]
 * Update label version elements (unified placement model)
 * 
 * Body: { elements: PlaceableElement[] }
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

    // Validate elements array is present
    if (!body.elements || !Array.isArray(body.elements)) {
      return NextResponse.json(
        { error: 'elements array is required' },
        { status: 400 }
      );
    }

    const elements = body.elements as PlaceableElement[];

    // Basic structure validation (detailed validation happens in service)
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el.id || typeof el.id !== 'string') {
        return NextResponse.json(
          { error: `Element ${i}: id is required and must be a string` },
          { status: 400 }
        );
      }
      if (!el.type || !['QR', 'BARCODE'].includes(el.type)) {
        return NextResponse.json(
          { error: `Element ${i}: type must be 'QR' or 'BARCODE'` },
          { status: 400 }
        );
      }
      if (!el.placement || typeof el.placement !== 'object') {
        return NextResponse.json(
          { error: `Element ${i}: placement object is required` },
          { status: 400 }
        );
      }
      const { xIn, yIn, widthIn, heightIn, rotation } = el.placement;
      if (typeof xIn !== 'number' || typeof yIn !== 'number' || 
          typeof widthIn !== 'number' || typeof heightIn !== 'number') {
        return NextResponse.json(
          { error: `Element ${i}: placement requires xIn, yIn, widthIn, heightIn as numbers` },
          { status: 400 }
        );
      }
      if (rotation !== undefined && ![0, 90, -90].includes(rotation)) {
        return NextResponse.json(
          { error: `Element ${i}: rotation must be 0, 90, or -90` },
          { status: 400 }
        );
      }
    }

    const updated = await updateVersionElements(id, elements, session.user.id);
    
    // Get updated metadata
    const meta = await getLabelMetadata(id);

    return NextResponse.json({
      ...updated,
      elements: meta.elements,
      labelMeta: {
        widthIn: meta.widthIn,
        heightIn: meta.heightIn
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

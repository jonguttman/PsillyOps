/**
 * Intro Sheets API Route
 *
 * POST - Generate intro sheet PDF for a catalog link
 * GET - List intro sheets with optional filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/auth';
import { generateIntroSheet, listIntroSheets } from '@/lib/services/introSheetService';

// ========================================
// POST - Generate Intro Sheet PDF
// ========================================

const generateSchema = z.object({
  catalogLinkId: z.string().min(1, 'Catalog link ID is required')
});

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify role (ADMIN or REP only)
    if (session.user.role !== 'ADMIN' && session.user.role !== 'REP') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = generateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { catalogLinkId } = validation.data;

    // Generate the intro sheet
    const result = await generateIntroSheet({
      catalogLinkId,
      createdById: session.user.id
    });

    // Return PDF with download headers
    const filename = `intro-sheet-${result.retailerName.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const pdfData = new Uint8Array(result.pdfBuffer);

    return new NextResponse(pdfData, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': result.pdfBuffer.length.toString()
      }
    });
  } catch (error) {
    console.error('Intro sheet generation error:', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    });

    const message = error instanceof Error ? error.message : 'Failed to generate intro sheet';

    // Return specific error messages for known errors
    if (message === 'Catalog link not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message === 'Catalog link is not active') {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to generate intro sheet' },
      { status: 500 }
    );
  }
}

// ========================================
// GET - List Intro Sheets
// ========================================

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify role (ADMIN or REP only)
    if (session.user.role !== 'ADMIN' && session.user.role !== 'REP') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const retailerId = searchParams.get('retailerId') || undefined;
    const catalogLinkId = searchParams.get('catalogLinkId') || undefined;
    const createdById = searchParams.get('createdById') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Get intro sheets
    const result = await listIntroSheets({
      retailerId,
      catalogLinkId,
      createdById,
      limit,
      offset
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('List intro sheets error:', error);
    return NextResponse.json(
      { error: 'Failed to list intro sheets' },
      { status: 500 }
    );
  }
}

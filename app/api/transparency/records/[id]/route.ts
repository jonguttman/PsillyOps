/**
 * API: Transparency Record by ID
 * 
 * GET    /api/transparency/records/[id] - Get a single record
 * PATCH  /api/transparency/records/[id] - Update a record
 * DELETE /api/transparency/records/[id] - Delete a record
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { isAdmin } from '@/lib/auth/rbac';
import {
  getTransparencyRecordById,
  updateTransparencyRecord,
  deleteTransparencyRecord,
} from '@/lib/services/transparencyService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const record = await getTransparencyRecordById(id);

    if (!record) {
      return NextResponse.json(
        { error: 'Transparency record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error('Error fetching transparency record:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transparency record' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const record = await updateTransparencyRecord(
      id,
      {
        productionDate: body.productionDate ? new Date(body.productionDate) : undefined,
        batchCode: body.batchCode,
        labId: body.labId,
        testDate: body.testDate ? new Date(body.testDate) : undefined,
        testResult: body.testResult,
        rawMaterialLinked: body.rawMaterialLinked,
        publicDescription: body.publicDescription,
      },
      session.user.id
    );

    return NextResponse.json(record);
  } catch (error) {
    console.error('Error updating transparency record:', error);
    
    if (error instanceof Error && error.message === 'Transparency record not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to update transparency record' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await deleteTransparencyRecord(id, session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting transparency record:', error);
    
    if (error instanceof Error && error.message === 'Transparency record not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to delete transparency record' },
      { status: 500 }
    );
  }
}

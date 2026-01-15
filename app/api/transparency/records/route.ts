/**
 * API: Transparency Records
 * 
 * GET  /api/transparency/records - List all records (admin)
 * POST /api/transparency/records - Create a new record (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { isAdmin } from '@/lib/auth/rbac';
import {
  listTransparencyRecords,
  createTransparencyRecord,
} from '@/lib/services/transparencyService';
import { ActivityEntity, TransparencyResult } from '@prisma/client';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only admins can view transparency records
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType') as ActivityEntity | null;
  const testResult = searchParams.get('testResult') as TransparencyResult | null;

  try {
    const records = await listTransparencyRecords({
      entityType: entityType || undefined,
      testResult: testResult || undefined,
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error('Error listing transparency records:', error);
    return NextResponse.json(
      { error: 'Failed to list transparency records' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only admins can create transparency records
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.entityType || !body.entityId || !body.productionDate) {
      return NextResponse.json(
        { error: 'Missing required fields: entityType, entityId, productionDate' },
        { status: 400 }
      );
    }

    const record = await createTransparencyRecord(
      {
        entityType: body.entityType,
        entityId: body.entityId,
        productionDate: new Date(body.productionDate),
        batchCode: body.batchCode,
        labId: body.labId,
        testDate: body.testDate ? new Date(body.testDate) : null,
        testResult: body.testResult,
        rawMaterialLinked: body.rawMaterialLinked,
        publicDescription: body.publicDescription,
      },
      session.user.id
    );

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error('Error creating transparency record:', error);
    return NextResponse.json(
      { error: 'Failed to create transparency record' },
      { status: 500 }
    );
  }
}

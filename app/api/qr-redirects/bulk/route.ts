// Bulk QR Redirect Rule Creation API
// Phase 7.2: Create multiple redirect rules in a single request
// Uses best-effort approach: creates rules for valid entities, skips those with existing rules

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { createRedirectRule } from '@/lib/services/qrRedirectService';
import { LabelEntityType } from '@prisma/client';

interface BulkCreateRequest {
  scopeType: 'PRODUCT' | 'BATCH';
  entityIds: string[];
  redirectUrl: string;
  reason?: string;
  startsAt?: string;
  endsAt?: string;
}

interface BulkCreateResponse {
  created: number;
  skipped: number;
  skippedItems: string[];
  errors: string[];
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body: BulkCreateRequest = await request.json();
    const { scopeType, entityIds, redirectUrl, reason, startsAt, endsAt } = body;

    // Validate required fields
    if (!scopeType || (scopeType !== 'PRODUCT' && scopeType !== 'BATCH')) {
      return NextResponse.json(
        { error: 'Invalid scope type. Must be PRODUCT or BATCH.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(entityIds) || entityIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one entity ID is required.' },
        { status: 400 }
      );
    }

    if (!redirectUrl) {
      return NextResponse.json(
        { error: 'Redirect URL is required.' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(redirectUrl);
    } catch {
      return NextResponse.json(
        { error: 'Invalid redirect URL format.' },
        { status: 400 }
      );
    }

    // Fetch existing active rules for the selected entities
    const existingRules = await prisma.qRRedirectRule.findMany({
      where: {
        active: true,
        entityType: scopeType as LabelEntityType,
        entityId: { in: entityIds }
      },
      select: { entityId: true }
    });

    const entitiesWithActiveRules = new Set(existingRules.map(r => r.entityId).filter(Boolean) as string[]);

    // Fetch entity names for the skipped items report
    let entityNames: Map<string, string> = new Map();
    if (scopeType === 'PRODUCT') {
      const products = await prisma.product.findMany({
        where: { id: { in: entityIds } },
        select: { id: true, name: true }
      });
      products.forEach(p => entityNames.set(p.id, p.name));
    } else {
      const batches = await prisma.batch.findMany({
        where: { id: { in: entityIds } },
        select: { id: true, batchCode: true }
      });
      batches.forEach(b => entityNames.set(b.id, b.batchCode));
    }

    // Separate eligible and skipped entities
    const eligibleIds = entityIds.filter(id => !entitiesWithActiveRules.has(id));
    const skippedIds = entityIds.filter(id => entitiesWithActiveRules.has(id));

    const result: BulkCreateResponse = {
      created: 0,
      skipped: skippedIds.length,
      skippedItems: skippedIds.map(id => entityNames.get(id) || id),
      errors: []
    };

    // Create rules for eligible entities (best-effort)
    for (const entityId of eligibleIds) {
      try {
        await createRedirectRule(
          {
            entityType: scopeType as LabelEntityType,
            entityId,
            redirectUrl,
            reason: reason || undefined,
            startsAt: startsAt ? new Date(startsAt) : undefined,
            endsAt: endsAt ? new Date(endsAt) : undefined
          },
          session.user.id
        );
        result.created++;
      } catch (err) {
        const entityName = entityNames.get(entityId) || entityId;
        result.errors.push(`Failed to create rule for ${entityName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Bulk redirect rule creation error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}


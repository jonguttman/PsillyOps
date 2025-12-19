// API endpoint for Default Redirect (Fallback) configuration
// This is a system-level setting, not a normal redirect rule
// Exactly one fallback can exist - uses UPSERT semantics

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';

// GET - Retrieve the current fallback redirect configuration
export async function GET() {
  const session = await auth();
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fallback = await prisma.qRRedirectRule.findFirst({
    where: { isFallback: true },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true }
      }
    }
  });

  return NextResponse.json({ fallback });
}

// PUT - Create or update the fallback redirect configuration (UPSERT)
export async function PUT(req: NextRequest) {
  const session = await auth();
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { redirectUrl, reason, startsAt, endsAt, active } = body;

    // Validate redirectUrl is required and valid
    if (!redirectUrl || typeof redirectUrl !== 'string') {
      return NextResponse.json(
        { error: 'redirectUrl is required' },
        { status: 400 }
      );
    }

    try {
      new URL(redirectUrl);
    } catch {
      return NextResponse.json(
        { error: 'redirectUrl must be a valid URL' },
        { status: 400 }
      );
    }

    // Validate time window
    if (startsAt && endsAt) {
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (start >= end) {
        return NextResponse.json(
          { error: 'startsAt must be before endsAt' },
          { status: 400 }
        );
      }
    }

    // Check if fallback already exists
    const existingFallback = await prisma.qRRedirectRule.findFirst({
      where: { isFallback: true }
    });

    let fallback;
    let action: 'created' | 'updated';

    if (existingFallback) {
      // Update existing fallback
      fallback = await prisma.qRRedirectRule.update({
        where: { id: existingFallback.id },
        data: {
          redirectUrl,
          reason: reason || null,
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
          active: active !== false, // Default to true
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        }
      });
      action = 'updated';
    } else {
      // Create new fallback
      fallback = await prisma.qRRedirectRule.create({
        data: {
          isFallback: true,
          entityType: null,
          entityId: null,
          versionId: null,
          redirectUrl,
          reason: reason || null,
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
          active: active !== false,
          createdById: session.user.id
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        }
      });
      action = 'created';
    }

    // Log the action
    await logAction({
      entityType: ActivityEntity.SYSTEM,
      entityId: fallback.id,
      action: `default_redirect_${action}`,
      userId: session.user.id,
      summary: `Default redirect ${action}: → ${redirectUrl}`,
      metadata: {
        ruleId: fallback.id,
        redirectUrl,
        reason,
        active: fallback.active,
        startsAt: fallback.startsAt,
        endsAt: fallback.endsAt
      },
      tags: ['qr', 'redirect', 'fallback', 'system', action]
    });

    return NextResponse.json({ 
      fallback,
      action 
    });

  } catch (error) {
    console.error('Error updating fallback redirect:', error);
    return NextResponse.json(
      { error: 'Failed to update fallback redirect' },
      { status: 500 }
    );
  }
}

// DELETE - Disable (not delete) the fallback redirect
export async function DELETE() {
  const session = await auth();
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existingFallback = await prisma.qRRedirectRule.findFirst({
    where: { isFallback: true }
  });

  if (!existingFallback) {
    return NextResponse.json(
      { error: 'No fallback redirect configured' },
      { status: 404 }
    );
  }

  // Disable rather than delete for audit trail
  const fallback = await prisma.qRRedirectRule.update({
    where: { id: existingFallback.id },
    data: { active: false }
  });

  await logAction({
    entityType: ActivityEntity.SYSTEM,
    entityId: fallback.id,
    action: 'default_redirect_disabled',
    userId: session.user.id,
    summary: `Default redirect disabled`,
    metadata: {
      ruleId: fallback.id,
      redirectUrl: fallback.redirectUrl
    },
    tags: ['qr', 'redirect', 'fallback', 'system', 'disabled']
  });

  return NextResponse.json({ success: true });
}


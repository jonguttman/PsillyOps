/**
 * Seal Preset Individual API
 * 
 * GET: Get single preset
 * PUT: Update preset
 * DELETE: Delete preset
 * POST (action=setLive): Set as live preset
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import type { SporeFieldConfig } from '@/lib/types/sealConfig';
import { validateConfig } from '@/lib/constants/sealPresets';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userRole = session.user.role;
    if (userRole !== 'ADMIN' && userRole !== 'WAREHOUSE') {
      return NextResponse.json(
        { error: 'Forbidden: ADMIN or WAREHOUSE role required' },
        { status: 403 }
      );
    }
    
    const { id } = await params;
    
    const preset = await prisma.sealPreset.findUnique({
      where: { id },
      include: {
        parent: {
          select: { id: true, name: true },
        },
        children: {
          select: { id: true, name: true },
        },
      },
    });
    
    if (!preset) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }
    
    return NextResponse.json({ preset });
    
  } catch (error) {
    console.error('[Preset GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preset' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userRole = session.user.role;
    if (userRole !== 'ADMIN' && userRole !== 'WAREHOUSE') {
      return NextResponse.json(
        { error: 'Forbidden: ADMIN or WAREHOUSE role required' },
        { status: 403 }
      );
    }
    
    const { id } = await params;
    const body = await request.json();
    const { name, description, config } = body as {
      name?: string;
      description?: string;
      config?: SporeFieldConfig;
    };
    
    // Validate config if provided
    if (config) {
      const errors = validateConfig(config);
      if (errors.length > 0) {
        return NextResponse.json(
          { error: 'Invalid config', details: errors },
          { status: 400 }
        );
      }
    }
    
    // Check if preset exists
    const existing = await prisma.sealPreset.findUnique({
      where: { id },
    });
    
    if (!existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }
    
    // Check for name conflict if name is being changed
    if (name && name !== existing.name) {
      const nameConflict = await prisma.sealPreset.findUnique({
        where: { name },
      });
      if (nameConflict) {
        return NextResponse.json(
          { error: 'Preset with this name already exists' },
          { status: 409 }
        );
      }
    }
    
    // Update preset
    const preset = await prisma.sealPreset.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(config && {
          basePreset: config.basePreset,
          config: config as unknown as Record<string, unknown>,
        }),
      },
    });
    
    return NextResponse.json({ preset });
    
  } catch (error) {
    console.error('[Preset PUT] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update preset' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userRole = session.user.role;
    if (userRole !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: ADMIN role required for deletion' },
        { status: 403 }
      );
    }
    
    const { id } = await params;
    
    // Check if preset exists and is not live
    const existing = await prisma.sealPreset.findUnique({
      where: { id },
    });
    
    if (!existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }
    
    if (existing.isLive) {
      return NextResponse.json(
        { error: 'Cannot delete live preset. Set another preset as live first.' },
        { status: 400 }
      );
    }
    
    // Delete preset
    await prisma.sealPreset.delete({
      where: { id },
    });
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('[Preset DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete preset' },
      { status: 500 }
    );
  }
}

/**
 * POST with action=setLive to set this preset as the live production preset
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userRole = session.user.role;
    if (userRole !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: ADMIN role required to set live preset' },
        { status: 403 }
      );
    }
    
    const { id } = await params;
    const body = await request.json();
    const { action } = body as { action: string };
    
    if (action !== 'setLive') {
      return NextResponse.json(
        { error: 'Invalid action. Use action=setLive' },
        { status: 400 }
      );
    }
    
    // Check if preset exists
    const existing = await prisma.sealPreset.findUnique({
      where: { id },
    });
    
    if (!existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }
    
    // Transaction: unset current live preset, set new one
    await prisma.$transaction([
      // Unset all live presets
      prisma.sealPreset.updateMany({
        where: { isLive: true },
        data: { isLive: false },
      }),
      // Set this preset as live
      prisma.sealPreset.update({
        where: { id },
        data: { isLive: true },
      }),
    ]);
    
    // Fetch updated preset
    const preset = await prisma.sealPreset.findUnique({
      where: { id },
    });
    
    return NextResponse.json({ preset, message: 'Preset set as live' });
    
  } catch (error) {
    console.error('[Preset POST setLive] Error:', error);
    return NextResponse.json(
      { error: 'Failed to set live preset' },
      { status: 500 }
    );
  }
}


/**
 * Seal Presets CRUD API
 * 
 * Manages saved seal presets for the tuner UI.
 * 
 * GET: List all presets
 * POST: Create new preset
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db';
import type { SporeFieldConfig } from '@/lib/types/sealConfig';
import { validateConfig } from '@/lib/constants/sealPresets';

export async function GET() {
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
    
    const presets = await prisma.sealPreset.findMany({
      orderBy: [
        { isLive: 'desc' },
        { updatedAt: 'desc' },
      ],
      include: {
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    
    return NextResponse.json({ presets });
    
  } catch (error) {
    console.error('[Presets GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch presets' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
    
    const body = await request.json();
    const { name, description, config, parentId } = body as {
      name: string;
      description?: string;
      config: SporeFieldConfig;
      parentId?: string;
    };
    
    if (!name || !config) {
      return NextResponse.json(
        { error: 'Missing required fields: name, config' },
        { status: 400 }
      );
    }
    
    // Validate config
    const errors = validateConfig(config);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Invalid config', details: errors },
        { status: 400 }
      );
    }
    
    // Check for duplicate name
    const existing = await prisma.sealPreset.findUnique({
      where: { name },
    });
    
    if (existing) {
      return NextResponse.json(
        { error: 'Preset with this name already exists' },
        { status: 409 }
      );
    }
    
    // Create preset
    const preset = await prisma.sealPreset.create({
      data: {
        name,
        description,
        basePreset: config.basePreset,
        config: config as unknown as Record<string, unknown>,
        parentId,
        createdById: session.user.id,
      },
    });
    
    return NextResponse.json({ preset }, { status: 201 });
    
  } catch (error) {
    console.error('[Presets POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create preset' },
      { status: 500 }
    );
  }
}


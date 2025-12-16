// API Route: Admin - List/Create Users
// Admin-only endpoint for user management

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: NextRequest) {
  try {
    // 1. Validate - Admin only
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Admin access required' },
        { status: 403 }
      );
    }

    // 2. Query users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // 3. Return JSON
    return Response.json({ users });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validate - Admin only
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { code: 'FORBIDDEN', message: 'Admin access required' },
        { status: 403 }
      );
    }

    // 2. Parse body
    const body = await req.json();
    const { name, email, password, role } = body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Missing required fields: name, email, password, role' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'];
    if (!validRoles.includes(role)) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Invalid role. Must be one of: ADMIN, PRODUCTION, WAREHOUSE, REP' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      return Response.json(
        { code: 'CONFLICT', message: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // 3. Hash password
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Create user
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        active: true,
        passwordSetAt: new Date()
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true
      }
    });

    // 5. Log action
    const { logUserCreated } = await import('@/lib/services/loggingService');
    logUserCreated({
      actorUserId: session.user.id,
      targetUserId: newUser.id,
      targetEmail: newUser.email,
      role: newUser.role
    }).catch(err => console.error('Failed to log user creation:', err));

    // 6. Return created user
    return Response.json({ user: newUser }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}


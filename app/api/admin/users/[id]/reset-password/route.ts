// API Route: Admin - Reset User Password
// Admin-only endpoint for password reset

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/prisma';

export async function POST(req: NextRequest) {
  try {
    // Extract user ID from URL path (Next.js 15 compliant pattern)
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    // For /api/admin/users/[id]/reset-password, the ID is at index 3 (second to last)
    const userId = segments[segments.length - 2];

    if (!userId) {
      return Response.json(
        { code: 'BAD_REQUEST', message: 'Missing user ID in path' },
        { status: 400 }
      );
    }

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

    // 2. Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    if (!user) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'User not found' },
        { status: 404 }
      );
    }

    // 3. Parse body (optional password, or generate temp)
    const body = await req.json();
    let newPassword = body.password;
    let wasGenerated = false;

    if (!newPassword) {
      // Generate temporary password
      const crypto = await import('crypto');
      newPassword = crypto.randomBytes(8).toString('hex');
      wasGenerated = true;
    }

    // Validate password length
    if (newPassword.length < 8) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // 4. Hash password
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 5. Update user
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordSetAt: new Date()
      }
    });

    // 6. Log action
    const loggingModule = await import('@/lib/services/loggingService');
    loggingModule.logUserPasswordReset({
      actorUserId: session.user.id,
      targetUserId: userId,
      targetEmail: user.email,
      metadata: {
        wasGenerated
      }
    }).catch(err => console.error('Failed to log password reset:', err));

    // 7. Return result
    return Response.json({
      message: 'Password reset successfully',
      tempPassword: wasGenerated ? newPassword : undefined,
      email: user.email,
      userName: user.name
    });
  } catch (error) {
    return handleApiError(error);
  }
}


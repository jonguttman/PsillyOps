// API Route: Admin - Update User
// Admin-only endpoint for updating user role and active status

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { handleApiError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/prisma';

export async function PATCH(req: NextRequest) {
  try {
    // Extract user ID from URL path (Next.js 15 compliant pattern)
    const url = new URL(req.url);
    const userId = url.pathname.split("/").at(-2);

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

    // 2. Get current user
    const currentUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!currentUser) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'User not found' },
        { status: 404 }
      );
    }

    // 3. Parse body
    const body = await req.json();
    const { role, active } = body;

    // Build update data
    const updateData: any = {};
    if (role !== undefined) {
      const validRoles = ['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'];
      if (!validRoles.includes(role)) {
        return Response.json(
          { code: 'VALIDATION_ERROR', message: 'Invalid role. Must be one of: ADMIN, PRODUCTION, WAREHOUSE, REP' },
          { status: 400 }
        );
      }
      updateData.role = role;
    }
    if (active !== undefined) {
      updateData.active = active;
    }

    if (Object.keys(updateData).length === 0) {
      return Response.json(
        { code: 'VALIDATION_ERROR', message: 'No valid fields to update. Provide role or active.' },
        { status: 400 }
      );
    }

    // 4. Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        updatedAt: true
      }
    });

    // 5. Log actions
    const loggingModule = await import('@/lib/services/loggingService');
    
    if (role !== undefined && role !== currentUser.role) {
      loggingModule.logUserRoleChanged({
        actorUserId: session.user.id,
        targetUserId: userId,
        targetEmail: currentUser.email,
        oldRole: currentUser.role,
        newRole: role
      }).catch(err => console.error('Failed to log role change:', err));
    }

    if (active !== undefined && active !== currentUser.active) {
      if (active) {
        loggingModule.logUserReactivated({
          actorUserId: session.user.id,
          targetUserId: userId,
          targetEmail: currentUser.email
        }).catch(err => console.error('Failed to log reactivation:', err));
      } else {
        loggingModule.logUserDeactivated({
          actorUserId: session.user.id,
          targetUserId: userId,
          targetEmail: currentUser.email
        }).catch(err => console.error('Failed to log deactivation:', err));
      }
    }

    // 6. Return updated user
    return Response.json({ user: updatedUser });
  } catch (error) {
    return handleApiError(error);
  }
}


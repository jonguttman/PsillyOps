// API Route: Get Users
// GET /api/users?production_execute=true&active=true

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/utils/errors';
import { hasPermission } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    // 1. Validate authentication
    const session = await auth();
    if (!session) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401 }
      );
    }

    // 2. Check RBAC permission - users.view OR production.assign (for assignment modal)
    const canViewUsers = hasPermission(session.user.role as UserRole, 'users', 'view');
    const canAssignProduction = hasPermission(session.user.role as UserRole, 'production', 'assign');
    
    if (!canViewUsers && !canAssignProduction) {
      return Response.json(
        { code: 'FORBIDDEN', message: 'You do not have permission to view users' },
        { status: 403 }
      );
    }

    // 3. Parse query parameters
    const { searchParams } = new URL(req.url);
    const productionExecute = searchParams.get('production_execute') === 'true';
    const activeOnly = searchParams.get('active') !== 'false'; // Default to true

    // 4. Build query
    const where: any = {};
    if (activeOnly) {
      where.active = true;
    }

    // 5. Fetch users
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
      orderBy: { name: 'asc' },
    });

    // 6. Filter by production.execute permission if requested
    let filteredUsers = users;
    if (productionExecute) {
      filteredUsers = users.filter(user => 
        hasPermission(user.role as UserRole, 'production', 'execute')
      );
    }

    return Response.json({
      success: true,
      users: filteredUsers,
      count: filteredUsers.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}


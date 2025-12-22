// Ops API route for TripDAR statistics
// Requires ADMIN or ANALYST role

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { hasPermission } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { getReviewStats } from '@/lib/services/experienceService';

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Check permissions
    if (!hasPermission(session.user.role as UserRole, 'insights', 'view')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }
    
    // Get statistics
    const stats = await getReviewStats();
    
    return NextResponse.json(stats);
  } catch (error) {
    console.error('[TripDAR Stats] Error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}


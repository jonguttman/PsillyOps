// Ops API route for browsing TripDAR reviews
// Requires ADMIN or ANALYST role

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { hasPermission } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

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
    
    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const productId = searchParams.get('productId') || undefined;
    const batchId = searchParams.get('batchId') || undefined;
    const experienceMode = searchParams.get('experienceMode') || undefined;
    const flagged = searchParams.get('flagged') === 'true' ? true : 
                    searchParams.get('flagged') === 'false' ? false : 
                    undefined;
    
    // Build where clause
    const where: any = {};
    if (productId) where.productId = productId;
    if (batchId) where.batchId = batchId;
    if (experienceMode) where.experienceMode = experienceMode;
    if (flagged !== undefined) {
      if (flagged) {
        where.integrityFlags = { not: null };
      } else {
        where.integrityFlags = null;
      }
    }
    
    // Get reviews with pagination
    const [reviews, total] = await Promise.all([
      prisma.experienceReview.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true
            }
          },
          batch: {
            select: {
              id: true,
              batchCode: true
            }
          },
          predictionProfile: {
            select: {
              id: true,
              transcend: true,
              energize: true,
              create: true,
              transform: true,
              connect: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.experienceReview.count({ where })
    ]);
    
    return NextResponse.json({
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('[TripDAR Reviews] Error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}


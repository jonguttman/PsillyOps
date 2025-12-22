// Ops API route for exporting TripDAR reviews
// Requires ADMIN or ANALYST role

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { hasPermission } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { getReviewsForExport } from '@/lib/services/experienceService';

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
    if (!hasPermission(session.user.role as UserRole, 'insights', 'export')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }
    
    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'json'; // 'csv' or 'json'
    const productId = searchParams.get('productId') || undefined;
    const batchId = searchParams.get('batchId') || undefined;
    const experienceMode = searchParams.get('experienceMode') || undefined;
    const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined;
    const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined;
    const flagged = searchParams.get('flagged') === 'true' ? true : 
                    searchParams.get('flagged') === 'false' ? false : 
                    undefined;
    
    // Get reviews
    const reviews = await getReviewsForExport({
      productId,
      batchId,
      experienceMode,
      from,
      to,
      flagged
    });
    
    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'id',
        'productId',
        'productName',
        'productSku',
        'batchId',
        'batchCode',
        'experienceMode',
        'overallMatch',
        'deltaTranscend',
        'deltaEnergize',
        'deltaCreate',
        'deltaTransform',
        'deltaConnect',
        'isFirstTime',
        'doseBandGrams',
        'doseRelative',
        'setting',
        'note',
        'completionRate',
        'createdAt'
      ];
      
      const rows = reviews.map(r => [
        r.id,
        r.productId,
        r.product.name,
        r.product.sku,
        r.batchId || '',
        r.batch?.batchCode || '',
        r.experienceMode,
        r.overallMatch ?? '',
        r.deltaTranscend ?? '',
        r.deltaEnergize ?? '',
        r.deltaCreate ?? '',
        r.deltaTransform ?? '',
        r.deltaConnect ?? '',
        r.isFirstTime ?? '',
        r.doseBandGrams || '',
        r.doseRelative || '',
        r.setting || '',
        (r.note || '').replace(/"/g, '""'), // Escape quotes for CSV
        r.completionRate.toString(),
        r.createdAt.toISOString()
      ]);
      
      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="tripdar-export-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    } else {
      // Return JSON
      return NextResponse.json(reviews, {
        headers: {
          'Content-Disposition': `attachment; filename="tripdar-export-${new Date().toISOString().split('T')[0]}.json"`
        }
      });
    }
  } catch (error) {
    console.error('[TripDAR Export] Error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}


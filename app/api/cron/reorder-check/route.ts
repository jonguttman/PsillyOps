// API Route: Reorder Check (Cron Job)
// STRICT LAYERING: Validate → Call Service → Return JSON

import { NextRequest } from 'next/server';
import { checkReorderPoints } from '@/lib/services/mrpService';
import { createProductionOrdersForShortages, createPurchaseOrdersForMaterialShortages } from '@/lib/services/mrpService';
import { handleApiError } from '@/lib/utils/errors';

export async function GET(req: NextRequest) {
  try {
    // 1. Validate (check for cron secret if needed)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Invalid cron secret' },
        { status: 401 }
      );
    }

    // 2. Call Service
    // Use system user ID (could be a specific admin user)
    const systemUserId = process.env.SYSTEM_USER_ID || 'system';
    
    const { productSuggestions, materialShortages } = await checkReorderPoints(systemUserId);

    // Create production orders for product shortages
    const productionOrderIds = await createProductionOrdersForShortages(
      productSuggestions.map(ps => ({
        productId: ps.productId,
        quantity: ps.quantityToMake
      })),
      systemUserId
    );

    // Create purchase orders for material shortages
    const purchaseOrderIds = await createPurchaseOrdersForMaterialShortages(
      materialShortages.map(ms => ({
        materialId: ms.materialId,
        quantity: ms.shortage
      })),
      systemUserId
    );

    // 3. Return JSON
    return Response.json({
      success: true,
      productSuggestions: productSuggestions.length,
      materialShortages: materialShortages.length,
      productionOrdersCreated: productionOrderIds.length,
      purchaseOrdersCreated: purchaseOrderIds.length
    });
  } catch (error) {
    return handleApiError(error);
  }
}


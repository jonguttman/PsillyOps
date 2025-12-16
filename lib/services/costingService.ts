// COSTING SERVICE - Product costing and analytics

import { prisma } from '@/lib/db/prisma';
import { AppError, ErrorCodes } from '@/lib/utils/errors';

export interface ProductCost {
  productId: string;
  productName: string;
  materialCostPerUnit: number;
  laborCostPerUnit: number;
  overheadCostPerUnit: number;
  totalCostPerUnit: number;
  bomBreakdown: {
    materialId: string;
    materialName: string;
    quantityPerUnit: number;
    unitCost: number;
    totalCost: number;
  }[];
}

/**
 * Calculate product costing based on BOM and latest material costs
 */
export async function calculateProductCost(productId: string): Promise<ProductCost> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      bom: {
        where: { active: true },
        include: {
          material: true
        }
      }
    }
  });

  if (!product) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found');
  }

  let materialCostPerUnit = 0;
  const bomBreakdown: ProductCost['bomBreakdown'] = [];

  for (const bomItem of product.bom) {
    // Get latest material cost from recent PO line items
    const recentPOLine = await prisma.purchaseOrderLineItem.findFirst({
      where: {
        materialId: bomItem.materialId,
        unitCost: { not: null }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const unitCost = recentPOLine?.unitCost || 0;
    const totalCost = unitCost * bomItem.quantityPerUnit;
    
    materialCostPerUnit += totalCost;

    bomBreakdown.push({
      materialId: bomItem.materialId,
      materialName: bomItem.material.name,
      quantityPerUnit: bomItem.quantityPerUnit,
      unitCost,
      totalCost
    });
  }

  // Labor and overhead could be added later
  const laborCostPerUnit = 0;
  const overheadCostPerUnit = 0;
  const totalCostPerUnit = materialCostPerUnit + laborCostPerUnit + overheadCostPerUnit;

  return {
    productId,
    productName: product.name,
    materialCostPerUnit,
    laborCostPerUnit,
    overheadCostPerUnit,
    totalCostPerUnit,
    bomBreakdown
  };
}





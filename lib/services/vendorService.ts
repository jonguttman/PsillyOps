// VENDOR SERVICE - Vendor performance tracking

import { prisma } from '@/lib/db/prisma';

export interface VendorScorecard {
  vendorId: string;
  vendorName: string;
  periodStart: Date;
  periodEnd: Date;
  totalPOs: number;
  onTimeDeliveries: number;
  onTimeDeliveryRate: number;
  avgLeadTimeDays: number;
  totalValuePurchased: number;
}

/**
 * Calculate vendor scorecard metrics for a time period
 */
export async function getVendorScorecard(
  vendorId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<VendorScorecard> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId }
  });

  if (!vendor) {
    throw new Error('Vendor not found');
  }

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      vendorId,
      createdAt: {
        gte: periodStart,
        lte: periodEnd
      },
      status: {
        in: ['RECEIVED', 'PARTIALLY_RECEIVED']
      }
    },
    include: {
      lineItems: true
    }
  });

  const totalPOs = purchaseOrders.length;
  
  let onTimeDeliveries = 0;
  let totalLeadTimeDays = 0;
  let totalValuePurchased = 0;

  for (const po of purchaseOrders) {
    // Check on-time delivery
    if (po.receivedAt && po.expectedDeliveryDate) {
      if (po.receivedAt <= po.expectedDeliveryDate) {
        onTimeDeliveries++;
      }
    }

    // Calculate lead time
    if (po.sentAt && po.receivedAt) {
      const leadTime = Math.floor(
        (po.receivedAt.getTime() - po.sentAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      totalLeadTimeDays += leadTime;
    }

    // Calculate value
    const poValue = po.lineItems.reduce(
      (sum, li) => sum + ((li.unitCost || 0) * li.quantityOrdered),
      0
    );
    totalValuePurchased += poValue;
  }

  const onTimeDeliveryRate = totalPOs > 0 ? onTimeDeliveries / totalPOs : 0;
  const avgLeadTimeDays = totalPOs > 0 ? totalLeadTimeDays / totalPOs : 0;

  return {
    vendorId,
    vendorName: vendor.name,
    periodStart,
    periodEnd,
    totalPOs,
    onTimeDeliveries,
    onTimeDeliveryRate,
    avgLeadTimeDays,
    totalValuePurchased
  };
}

/**
 * Get scorecards for all active vendors
 */
export async function getAllVendorScorecards(
  periodStart: Date,
  periodEnd: Date
): Promise<VendorScorecard[]> {
  const vendors = await prisma.vendor.findMany({
    where: { active: true }
  });

  const scorecards: VendorScorecard[] = [];

  for (const vendor of vendors) {
    try {
      const scorecard = await getVendorScorecard(vendor.id, periodStart, periodEnd);
      scorecards.push(scorecard);
    } catch (error) {
      console.error(`Error calculating scorecard for vendor ${vendor.id}:`, error);
    }
  }

  return scorecards.sort((a, b) => b.totalValuePurchased - a.totalValuePurchased);
}







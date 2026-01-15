// Create QR Redirect Rule Page
// Admin-only page for creating new redirect rules
// Phase 7.1: Visual scope selection with tabs for Products and Batches
// Phase 7.2: Multi-select for bulk rule creation

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ProductItem, BatchItem } from './ScopeSelector';
import CreateRuleForm from './CreateRuleForm';

export default async function CreateRedirectRulePage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  // Calculate date 30 days ago for recent batches
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch products with active rule status
  const [products, recentBatches, plannedBatches, activeRules] = await Promise.all([
    // All active products
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, sku: true },
      orderBy: { name: 'asc' }
    }),
    
    // Recent batches (last 30 days, all statuses except CANCELLED)
    prisma.batch.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        status: { notIn: ['CANCELLED'] }
      },
      select: { 
        id: true, 
        batchCode: true, 
        status: true,
        product: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    }),
    
    // Planned batches (PLANNED status)
    prisma.batch.findMany({
      where: {
        status: 'PLANNED'
      },
      select: { 
        id: true, 
        batchCode: true, 
        status: true,
        product: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    }),
    
    // Active redirect rules to mark entities that already have rules
    prisma.qRRedirectRule.findMany({
      where: {
        active: true,
        entityType: { not: null }
      },
      select: { entityType: true, entityId: true }
    })
  ]);

  // Build sets of entities with active rules
  const productsWithActiveRules = new Set<string>();
  const batchesWithActiveRules = new Set<string>();
  
  for (const rule of activeRules) {
    if (rule.entityType === 'PRODUCT' && rule.entityId) {
      productsWithActiveRules.add(rule.entityId);
    } else if (rule.entityType === 'BATCH' && rule.entityId) {
      batchesWithActiveRules.add(rule.entityId);
    }
  }

  // Transform products for the selector
  const productItems: ProductItem[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    hasActiveRule: productsWithActiveRules.has(p.id)
  }));

  // Transform recent batches (exclude PLANNED since they're in the other section)
  const recentBatchItems: BatchItem[] = recentBatches
    .filter((b) => b.status !== 'PLANNED')
    .map((b) => ({
      id: b.id,
      batchCode: b.batchCode,
      productName: b.product.name,
      status: b.status,
      isPlanned: false,
      hasActiveRule: batchesWithActiveRules.has(b.id)
    }));

  // Transform planned batches
  const plannedBatchItems: BatchItem[] = plannedBatches.map((b) => ({
    id: b.id,
    batchCode: b.batchCode,
    productName: b.product.name,
    status: b.status,
    isPlanned: true,
    hasActiveRule: batchesWithActiveRules.has(b.id)
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Redirect Rule</h1>
          <p className="mt-1 text-sm text-gray-600">
            Select products or batches, then configure where QR scans should redirect
          </p>
        </div>
        <Link
          href="/ops/qr/redirects"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          ← Back to Rules
        </Link>
      </div>

      <CreateRuleForm
        products={productItems}
        recentBatches={recentBatchItems}
        plannedBatches={plannedBatchItems}
      />
    </div>
  );
}


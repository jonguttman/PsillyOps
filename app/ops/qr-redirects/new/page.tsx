// Create QR Redirect Rule Page
// Admin-only page for creating new redirect rules
// Phase 7.1: Visual scope selection with tabs for Products and Batches

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { createRedirectRule } from '@/lib/services/qrRedirectService';
import { LabelEntityType } from '@prisma/client';
import ScopeSelector, { ProductItem, BatchItem } from './ScopeSelector';

async function createRule(formData: FormData) {
  'use server';
  
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }
  
  const scopeType = formData.get('scopeType') as string;
  const productId = formData.get('productId') as string;
  const batchId = formData.get('batchId') as string;
  const redirectUrl = formData.get('redirectUrl') as string;
  const reason = formData.get('reason') as string;
  const startsAt = formData.get('startsAt') as string;
  const endsAt = formData.get('endsAt') as string;

  // Validate that a scope is selected
  if (!scopeType || (scopeType !== 'PRODUCT' && scopeType !== 'BATCH')) {
    throw new Error('Please select a product or batch');
  }

  let entityType: LabelEntityType;
  let entityId: string;

  if (scopeType === 'PRODUCT') {
    if (!productId) {
      throw new Error('Please select a product');
    }
    entityType = 'PRODUCT';
    entityId = productId;
  } else {
    if (!batchId) {
      throw new Error('Please select a batch');
    }
    entityType = 'BATCH';
    entityId = batchId;
  }

  await createRedirectRule(
    {
      entityType,
      entityId,
      redirectUrl,
      reason: reason || undefined,
      startsAt: startsAt ? new Date(startsAt) : undefined,
      endsAt: endsAt ? new Date(endsAt) : undefined
    },
    session.user.id
  );

  revalidatePath('/ops/qr-redirects');
  redirect('/ops/qr-redirects');
}

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
      isPlanned: false
    }));

  // Transform planned batches
  const plannedBatchItems: BatchItem[] = plannedBatches.map((b) => ({
    id: b.id,
    batchCode: b.batchCode,
    productName: b.product.name,
    status: b.status,
    isPlanned: true
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Redirect Rule</h1>
          <p className="mt-1 text-sm text-gray-600">
            Select a product or batch, then configure where QR scans should redirect
          </p>
        </div>
        <Link
          href="/ops/qr-redirects"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          ← Back to Rules
        </Link>
      </div>

      <form action={createRule} className="bg-white shadow rounded-lg p-6 space-y-6">
        {/* Visual Scope Selector (Phase 7.1) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            What should this rule affect? <span className="text-red-500">*</span>
          </label>
          <ScopeSelector
            products={productItems}
            recentBatches={recentBatchItems}
            plannedBatches={plannedBatchItems}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-sm font-medium text-gray-900 mb-4">Redirect Settings</h2>
        </div>

        {/* Redirect URL */}
        <div>
          <label htmlFor="redirectUrl" className="block text-sm font-medium text-gray-700">
            Redirect URL <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            name="redirectUrl"
            id="redirectUrl"
            required
            placeholder="https://example.com/promo"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Where should QR scans redirect to? Must be a valid URL.
          </p>
        </div>

        {/* Reason */}
        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
            Reason
          </label>
          <input
            type="text"
            name="reason"
            id="reason"
            placeholder="e.g., Summer campaign, Product recall, Updated information"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Optional. Document why this redirect exists for audit purposes.
          </p>
        </div>

        {/* Time Window */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="startsAt" className="block text-sm font-medium text-gray-700">
              Start Date/Time
            </label>
            <input
              type="datetime-local"
              name="startsAt"
              id="startsAt"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Optional. Leave empty to start immediately.
            </p>
          </div>
          <div>
            <label htmlFor="endsAt" className="block text-sm font-medium text-gray-700">
              End Date/Time
            </label>
            <input
              type="datetime-local"
              name="endsAt"
              id="endsAt"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Optional. Leave empty for no expiration.
            </p>
          </div>
        </div>

        {/* Warning about existing rules */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-amber-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-amber-800">
              <strong>Note:</strong> Only one active rule can exist per scope. Items with active rules are marked and cannot be selected.
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Link
            href="/ops/qr-redirects"
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Create Rule
          </button>
        </div>
      </form>
    </div>
  );
}

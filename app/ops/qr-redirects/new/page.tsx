// Create QR Redirect Rule Page
// Admin-only page for creating new redirect rules

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { createRedirectRule, getActiveRuleForEntity } from '@/lib/services/qrRedirectService';
import { LabelEntityType } from '@prisma/client';

async function createRule(formData: FormData) {
  'use server';
  
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }
  
  const scopeType = formData.get('scopeType') as string;
  const productId = formData.get('productId') as string;
  const batchId = formData.get('batchId') as string;
  const inventoryId = formData.get('inventoryId') as string;
  const versionId = formData.get('versionId') as string;
  const redirectUrl = formData.get('redirectUrl') as string;
  const reason = formData.get('reason') as string;
  const startsAt = formData.get('startsAt') as string;
  const endsAt = formData.get('endsAt') as string;

  let entityType: LabelEntityType | undefined;
  let entityId: string | undefined;

  switch (scopeType) {
    case 'PRODUCT':
      entityType = 'PRODUCT';
      entityId = productId;
      break;
    case 'BATCH':
      entityType = 'BATCH';
      entityId = batchId;
      break;
    case 'INVENTORY':
      entityType = 'INVENTORY';
      entityId = inventoryId;
      break;
    case 'VERSION':
      // versionId is handled separately
      break;
    default:
      throw new Error('Invalid scope type');
  }

  await createRedirectRule(
    {
      entityType,
      entityId,
      versionId: scopeType === 'VERSION' ? versionId : undefined,
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

  // Fetch available entities for selection
  const [products, batches, labelVersions] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, sku: true },
      orderBy: { name: 'asc' }
    }),
    prisma.batch.findMany({
      where: {
        status: { in: ['IN_PROGRESS', 'QC_HOLD', 'RELEASED'] }
      },
      select: { id: true, batchCode: true },
      orderBy: { createdAt: 'desc' },
      take: 100
    }),
    prisma.labelTemplateVersion.findMany({
      where: { isActive: true },
      include: {
        template: { select: { name: true, entityType: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  // Check which entities already have active rules
  const productsWithActiveRules = new Set<string>();
  const batchesWithActiveRules = new Set<string>();
  
  const activeEntityRules = await prisma.qRRedirectRule.findMany({
    where: {
      active: true,
      entityType: { not: null }
    },
    select: { entityType: true, entityId: true }
  });

  for (const rule of activeEntityRules) {
    if (rule.entityType === 'PRODUCT' && rule.entityId) {
      productsWithActiveRules.add(rule.entityId);
    } else if (rule.entityType === 'BATCH' && rule.entityId) {
      batchesWithActiveRules.add(rule.entityId);
    }
  }

  const activeVersionRules = await prisma.qRRedirectRule.findMany({
    where: {
      active: true,
      versionId: { not: null }
    },
    select: { versionId: true }
  });
  const versionsWithActiveRules = new Set(activeVersionRules.map(r => r.versionId));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Redirect Rule</h1>
          <p className="mt-1 text-sm text-gray-600">
            Create a new QR redirect rule for a product, batch, or label version
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
        {/* Scope Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Scope Type <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="relative flex items-center justify-center px-4 py-3 border rounded-lg cursor-pointer hover:bg-gray-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
              <input type="radio" name="scopeType" value="PRODUCT" className="sr-only peer" required defaultChecked />
              <span className="text-sm font-medium peer-checked:text-blue-700">Product</span>
            </label>
            <label className="relative flex items-center justify-center px-4 py-3 border rounded-lg cursor-pointer hover:bg-gray-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
              <input type="radio" name="scopeType" value="BATCH" className="sr-only peer" />
              <span className="text-sm font-medium peer-checked:text-blue-700">Batch</span>
            </label>
            <label className="relative flex items-center justify-center px-4 py-3 border rounded-lg cursor-pointer hover:bg-gray-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
              <input type="radio" name="scopeType" value="INVENTORY" className="sr-only peer" />
              <span className="text-sm font-medium peer-checked:text-blue-700">Inventory</span>
            </label>
            <label className="relative flex items-center justify-center px-4 py-3 border rounded-lg cursor-pointer hover:bg-gray-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
              <input type="radio" name="scopeType" value="VERSION" className="sr-only peer" />
              <span className="text-sm font-medium peer-checked:text-blue-700">Template Version</span>
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Choose what type of entity this redirect rule will target
          </p>
        </div>

        {/* Entity Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Product Selection */}
          <div>
            <label htmlFor="productId" className="block text-sm font-medium text-gray-700">
              Product
            </label>
            <select
              name="productId"
              id="productId"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">Select a product...</option>
              {products.map((product) => (
                <option 
                  key={product.id} 
                  value={product.id}
                  disabled={productsWithActiveRules.has(product.id)}
                >
                  {product.name} ({product.sku})
                  {productsWithActiveRules.has(product.id) && ' — Has active rule'}
                </option>
              ))}
            </select>
          </div>

          {/* Batch Selection */}
          <div>
            <label htmlFor="batchId" className="block text-sm font-medium text-gray-700">
              Batch
            </label>
            <select
              name="batchId"
              id="batchId"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">Select a batch...</option>
              {batches.map((batch) => (
                <option 
                  key={batch.id} 
                  value={batch.id}
                  disabled={batchesWithActiveRules.has(batch.id)}
                >
                  {batch.batchCode}
                  {batchesWithActiveRules.has(batch.id) && ' — Has active rule'}
                </option>
              ))}
            </select>
          </div>

          {/* Inventory ID (manual entry) */}
          <div>
            <label htmlFor="inventoryId" className="block text-sm font-medium text-gray-700">
              Inventory ID
            </label>
            <input
              type="text"
              name="inventoryId"
              id="inventoryId"
              placeholder="Enter inventory item ID"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          {/* Version Selection */}
          <div>
            <label htmlFor="versionId" className="block text-sm font-medium text-gray-700">
              Label Template Version
            </label>
            <select
              name="versionId"
              id="versionId"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">Select a version...</option>
              {labelVersions.map((version) => (
                <option 
                  key={version.id} 
                  value={version.id}
                  disabled={versionsWithActiveRules.has(version.id)}
                >
                  {version.template.name} v{version.version}
                  {versionsWithActiveRules.has(version.id) && ' — Has active rule'}
                </option>
              ))}
            </select>
          </div>
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
              <strong>Note:</strong> Only one active rule can exist per scope. If an active rule already exists for the selected entity, you must deactivate it first.
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

